use ::std::usize;
use std::collections::HashMap;

use ::scoped_gc::{Gc, GcRefCell};
use avm1_tree as avm1;
use scoped_gc::GcScope;

use host::Host;
use values::{AvmNumber, AvmObject, AvmString, AvmUndefined, AvmValue};

pub struct Vm<'gc> {
  gc: GcScope<'gc>,

  pub swf_version: u8,

  host: &'gc Host,

  next_script_id: Avm1ScriptId,
  scripts_by_id: HashMap<Avm1ScriptId, Avm1Script>,
}

impl<'gc> Vm<'gc> {
  pub fn new(host: &'gc Host, swf_version: u8) -> Self {
    Self {
      gc: GcScope::new(),
      swf_version,
      host,
      next_script_id: Avm1ScriptId(0),
      scripts_by_id: HashMap::new(),
    }
  }

  pub fn create_script(&mut self, code: Vec<u8>, uri: Option<String>, target: Option<TargetId>) -> Avm1ScriptId {
    let id: Avm1ScriptId = self.next_script_id;
    self.next_script_id = Avm1ScriptId(id.0 + 1);
    let script = Avm1Script { id, uri, code, target };
    self.scripts_by_id.insert(id, script);
    id
  }

  pub fn run_to_completion(&mut self, script_id: Avm1ScriptId) -> () {
    // TODO: Avoid `clone` (use `Rc` in `scripts_by_id`?)
    let script: Avm1Script = {
      self.scripts_by_id.get(&script_id).unwrap().clone()
    };

    let frame: CallFrame = CallFrame {
      code: &script.code,
      ip: 0,
      call_result: AvmValue::UNDEFINED,
      stack: Stack::new(),
      parent: None,
    };

    let mut ectx = ExecutionContext::new(self, frame);

    const MAX_ACTIONS: usize = 1000;
    for _ in 0..MAX_ACTIONS {
      let has_advanced = ectx.next();
      if !has_advanced {
        break;
      }
    }
  }
}

#[derive(Debug, Eq, PartialEq, Copy, Clone, Hash, Ord, PartialOrd)]
pub struct Avm1ScriptId(usize);

#[derive(Debug, Eq, PartialEq, Copy, Clone, Hash, Ord, PartialOrd)]
pub struct TargetId(usize);

#[derive(Debug, Eq, PartialEq, Clone)]
pub(crate) struct Avm1Script {
  /// Key identifying this script, unique for each VM
  id: Avm1ScriptId,

  /// Optional URI to help the user identify this script.
  uri: Option<String>,

  /// AVM1 byte code for this script.
  code: Vec<u8>,

  /// Default target for this script.
  ///
  /// The target is used for contextual actions such as `gotoAndPlay` or `stop`.
  /// The script target acts as the default (e.g. used for `setTarget("");`).
  target: Option<TargetId>,
}

struct Stack<'gc> (Vec<AvmValue<'gc>>);

impl<'gc> Stack<'gc> {
  pub fn new() -> Stack<'gc> {
    Stack(Vec::new())
  }

  pub fn pop(&mut self) -> AvmValue<'gc> {
    self.0.pop().unwrap_or(AvmValue::Undefined(AvmUndefined))
  }

  pub fn push(&mut self, value: AvmValue<'gc>) {
    self.0.push(value);
  }
}

pub struct CallFrame<'frame, 'gc: 'frame> {
  code: &'frame [u8],
  // Instruction pointer
  ip: usize,
  call_result: AvmValue<'gc>,
  stack: Stack<'gc>,
  parent: Option<&'frame CallFrame<'frame, 'gc>>,
}

pub struct ExecutionContext<'ectx, 'gc: 'ectx> {
  vm: &'ectx mut Vm<'gc>,
  frame: CallFrame<'ectx, 'gc>,
}

enum PreferredType {
  None,
  Number,
  String,
}

/// Implements ES-262-3 section 9.1 ("ToPrimitive")
fn to_primitive(value: AvmValue, _preferred_type: PreferredType) -> AvmValue {
  match value {
    AvmValue::Undefined(_) => value,
    AvmValue::Null(_) => value,
    AvmValue::Boolean(_) => value,
    AvmValue::Number(_) => value,
    AvmValue::String(_) => value,
    AvmValue::Object(_) => unimplemented!(),
  }
}

fn to_usize(value: AvmValue) -> Option<usize> {
  match value {
    AvmValue::Number(avm_number) => {
      let value: f64 = avm_number.value();
      if (usize::MIN as f64) <= value && value <= (usize::MAX as f64) && value == value.trunc() {
        Some(value as usize)
      } else {
        None
      }
    }
    _ => None,
  }
}

impl<'ectx, 'gc: 'ectx> ExecutionContext<'ectx, 'gc> {
  pub fn new(vm: &'ectx mut Vm<'gc>, frame: CallFrame<'ectx, 'gc>) -> Self {
    Self {
      vm,
      frame,
    }
  }

  /// Executes the next step, returns a boolean `has_advanced`.
  pub fn next(&mut self) -> bool {
    // TODO: Cleaner support for the `End` action
    if self.frame.ip >= self.frame.code.len() || self.frame.code[self.frame.ip] == 0 {
      return false;
    }

    let (input, action) = avm1_parser::parse_action(&self.frame.code[self.frame.ip..]).unwrap();
    self.frame.ip = input.as_ptr() as usize - self.frame.code.as_ptr() as usize;
    self.exec(&action);
    true
  }

  pub fn exec(&mut self, action: &avm1::Action) -> () {
    match action {
      &avm1::Action::Add => self.exec_add(),
      &avm1::Action::Add2 => self.exec_add2(),
      &avm1::Action::And => self.exec_and(),
      &avm1::Action::Divide => self.exec_divide(),
      &avm1::Action::Equals => self.exec_equals(),
      &avm1::Action::GetMember => self.exec_get_member(),
      &avm1::Action::InitArray => self.exec_init_array(),
      &avm1::Action::InitObject => self.exec_init_object(),
      &avm1::Action::Less => self.exec_less(),
      &avm1::Action::Multiply => self.exec_multiply(),
      &avm1::Action::Not => self.exec_not(),
      &avm1::Action::Or => self.exec_or(),
      &avm1::Action::Pop => self.exec_pop(),
      &avm1::Action::Push(ref push) => self.exec_push(push),
      &avm1::Action::StringAdd => self.exec_string_add(),
      &avm1::Action::StringEquals => self.exec_string_equals(),
      &avm1::Action::StringLength => self.exec_string_length(),
      &avm1::Action::Subtract => self.exec_subtract(),
      &avm1::Action::Trace => self.exec_trace(),
      _ => unimplemented!(),
    }
  }

  fn exec_add(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::number(left + right));
  }

  /// Implements the add operation as defined in ECMA-262-3, section 11.6.1
  /// ("The Addition operator ( + )")
  fn exec_add2(&mut self) -> () {
    let right = self.frame.stack.pop();
    let left = self.frame.stack.pop();
    let left = to_primitive(left, PreferredType::None);
    let right = to_primitive(right, PreferredType::None);
    match (left, right) {
      (left @ AvmValue::String(_), right) | (left, right @ AvmValue::String(_)) => {
        let left = left.to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap();
        let right = right.to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap();
        let result = format!("{}{}", left.value(), right.value());
        self.frame.stack.push(AvmValue::String(AvmString::new(&self.vm.gc, result).unwrap()));
      }
      (left, right) => {
        let left = left.to_avm_number();
        let right = right.to_avm_number();
        let result = left.value() + right.value();
        self.frame.stack.push(AvmValue::number(result))
      }
    }
  }

  fn exec_and(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::legacy_boolean(left != 0f64 && right != 0f64, self.vm.swf_version));
  }

  fn exec_divide(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    if right == 0f64 && self.vm.swf_version < 5 {
      self.frame.stack.push(AvmValue::String(AvmString::new(&self.vm.gc, String::from("#ERROR#")).unwrap()))
    } else {
      self.frame.stack.push(AvmValue::Number(AvmNumber::new(left / right)))
    }
  }

  fn exec_equals(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::legacy_boolean(left == right, self.vm.swf_version))
  }

  fn exec_get_member(&mut self) -> () {
    let key: String = String::from(self.frame.stack.pop().to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value());
    match self.frame.stack.pop() {
      AvmValue::Object(ref avm_object) => {
        self.frame.stack.push(avm_object.borrow().get(key))
      }
      _ => unimplemented!(),
    }
  }

  fn exec_init_array(&mut self) -> () {
    unimplemented!()
  }

  fn exec_init_object(&mut self) -> () {
    let property_count: usize = to_usize(self.frame.stack.pop()).unwrap();
    let obj: Gc<GcRefCell<AvmObject>> = AvmObject::new(&self.vm.gc).unwrap();
    for _ in 0..property_count {
      let value: AvmValue = self.frame.stack.pop();
      let key: String = String::from(self.frame.stack.pop().to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value());
      obj.borrow_mut().set(key, value);
    }
    self.frame.stack.push(AvmValue::Object(obj))
  }

  fn exec_less(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::legacy_boolean(left < right, self.vm.swf_version))
  }

  fn exec_multiply(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::Number(AvmNumber::new(left * right)));
  }

  fn exec_not(&mut self) -> () {
    let value = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::legacy_boolean(value == 0f64, self.vm.swf_version));
  }

  fn exec_or(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::legacy_boolean(left != 0f64 || right != 0f64, self.vm.swf_version));
  }

  pub fn exec_pop(&mut self) -> () {
    self.frame.stack.pop();
  }

  fn exec_push(&mut self, push: &avm1::actions::Push) -> () {
    for value in &push.values {
      self.frame.stack.push(AvmValue::from_ast(&self.vm.gc, value).unwrap())
    }
  }

  fn exec_string_add(&mut self) -> () {
    let right = self.frame.stack.pop().to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    let left = self.frame.stack.pop().to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    self.frame.stack.push(AvmValue::string(&self.vm.gc, format!("{}{}", left, right)).unwrap());
  }

  fn exec_string_equals(&mut self) -> () {
    let right = self.frame.stack.pop().to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    let left = self.frame.stack.pop().to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    let result = left == right;
    self.frame.stack.push(AvmValue::legacy_boolean(result, self.vm.swf_version));
  }

  fn exec_string_length(&mut self) -> () {
    let value = self.frame.stack.pop().to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    // TODO: Checked conversion
    self.frame.stack.push(AvmValue::number(value.len() as f64));
  }

  fn exec_subtract(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    self.frame.stack.push(AvmValue::number(left - right))
  }

  fn exec_trace(&mut self) -> () {
    // `undefined` is always `undefined` when passed to `trace`, even for swf_version < 7.
    match self.frame.stack.pop() {
      AvmValue::Undefined(_) => self.vm.host.trace("undefined"),
      avm_value => self.vm.host.trace(avm_value.to_avm_string(&self.vm.gc, self.vm.swf_version).unwrap().value()),
    };
  }
}
