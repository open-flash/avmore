use ::std::usize;
use std::collections::HashMap;

use ::scoped_gc::{Gc, GcRefCell};
use avm1_tree as avm1;
use scoped_gc::{GcAllocErr, GcScope};

use crate::host::Host;
use crate::values::{AvmNumber, AvmObject, AvmString, AvmValue};

pub struct Vm<'gc> {
  gc: &'gc GcScope<'gc>,

  pub swf_version: u8,

  // This is wrong: the pool may be dropped AFTER the GcScope
  pool: ConstantPool<'gc>,

  host: &'gc Host,

  next_script_id: Avm1ScriptId,
  scripts_by_id: HashMap<Avm1ScriptId, Avm1Script>,
}

impl<'gc> Vm<'gc> {
  pub fn new(gc: &'gc GcScope<'gc>, host: &'gc Host, swf_version: u8) -> Self {
    Self {
      gc,
      swf_version,
      pool: ConstantPool::new(),
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
      scope: Scope::empty(),
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

struct ConstantPool<'gc> (Option<Vec<Gc<'gc, AvmString>>>);

impl<'gc> ConstantPool<'gc> {
  pub fn new() -> Self {
    ConstantPool(None)
  }

  pub fn set(&mut self, pool: Vec<Gc<'gc, AvmString>>) -> () {
    self.0 = Some(pool);
  }

  pub fn get(&self, index: u16) -> AvmValue<'gc> {
    match self.0 {
      // TODO: Add option to mimic Adobe's uninitialized pool values
      None => AvmValue::UNDEFINED,
      Some(ref pool) => {
        match pool.get(index as usize) {
          None => AvmValue::UNDEFINED,
          Some(s) => AvmValue::String(Gc::clone(s)),
        }
      }
    }
  }
}

struct Scope<'ps, 'gc: 'ps> {
  variables: HashMap<String, AvmValue<'gc>>,
  parent: Option<&'ps Scope<'ps, 'gc>>,
}

impl <'ps, 'gc: 'ps> Scope<'ps, 'gc> {
  fn empty() -> Self {
    Self {
      variables: HashMap::new(),
      parent: None,
    }
  }

  fn set(&mut self, name: String, value: AvmValue<'gc>) -> () {
    self.variables.insert(name, value);
  }

  fn get(&mut self, name: &str) -> Option<AvmValue<'gc>> {
    self.variables.get(name).map(|v| v.clone())
  }
}

struct Stack<'gc> (Vec<AvmValue<'gc>>);

impl<'gc> Stack<'gc> {
  pub fn new() -> Self {
    Stack(Vec::new())
  }

  pub fn pop(&mut self) -> AvmValue<'gc> {
    self.0.pop().unwrap_or(AvmValue::UNDEFINED)
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
  scope: Scope<'frame, 'gc>,
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
      &avm1::Action::AsciiToChar => unimplemented!("AsciiToChar"),
      &avm1::Action::BitAnd => unimplemented!("BitAnd"),
      &avm1::Action::BitLShift => unimplemented!("BitLShift"),
      &avm1::Action::BitOr => unimplemented!("BitOr"),
      &avm1::Action::BitRShift => unimplemented!("BitRShift"),
      &avm1::Action::BitURShift => unimplemented!("BitURShift"),
      &avm1::Action::BitXor => unimplemented!("BitXor"),
      &avm1::Action::Call => unimplemented!("Call"),
      &avm1::Action::CallFunction => unimplemented!("CallFunction"),
      &avm1::Action::CallMethod => unimplemented!("CallMethod"),
      &avm1::Action::CastOp => unimplemented!("CastOp"),
      &avm1::Action::ConstantPool(ref constant_pool) => self.exec_constant_pool(constant_pool),
      &avm1::Action::CharToAscii => unimplemented!("CharToAscii"),
      &avm1::Action::CloneSprite => unimplemented!("CloneSprite"),
      &avm1::Action::Decrement => unimplemented!("Decrement"),
      &avm1::Action::DefineFunction(_) => unimplemented!("DefineFunction"),
      &avm1::Action::DefineFunction2(_) => unimplemented!("DefineFunction2"),
      &avm1::Action::DefineLocal => unimplemented!("DefineLocal"),
      &avm1::Action::DefineLocal2 => unimplemented!("DefineLocal2"),
      &avm1::Action::Delete => unimplemented!("Delete"),
      &avm1::Action::Delete2 => unimplemented!("Delete2"),
      &avm1::Action::Divide => self.exec_divide(),
      &avm1::Action::EndDrag => unimplemented!("EndDrag"),
      &avm1::Action::Enumerate => unimplemented!("Enumerate"),
      &avm1::Action::Enumerate2 => unimplemented!("Enumerate2"),
      &avm1::Action::Equals => self.exec_equals(),
      &avm1::Action::Equals2 => unimplemented!("Equals2"),
      &avm1::Action::Extends => unimplemented!("Extends"),
      &avm1::Action::FsCommand2 => unimplemented!("FsCommand2"),
      &avm1::Action::GetMember => self.exec_get_member(),
      &avm1::Action::GetProperty => unimplemented!("GetProperty"),
      &avm1::Action::GetTime => unimplemented!("GetTime"),
      &avm1::Action::GetUrl(_) => unimplemented!("GetUrl"),
      &avm1::Action::GetUrl2(_) => unimplemented!("GetUrl2"),
      &avm1::Action::GetVariable => self.exec_get_variable(),
      &avm1::Action::GotoFrame(_) => unimplemented!("GotoFrame"),
      &avm1::Action::GotoFrame2(_) => unimplemented!("GotoFrame2"),
      &avm1::Action::GotoLabel(_) => unimplemented!("GotoLabel"),
      &avm1::Action::Greater => unimplemented!("Greater"),
      &avm1::Action::If(_) => unimplemented!("If"),
      &avm1::Action::ImplementsOp => unimplemented!("ImplementsOp"),
      &avm1::Action::Increment => unimplemented!("Increment"),
      &avm1::Action::InitArray => self.exec_init_array(),
      &avm1::Action::InitObject => self.exec_init_object(),
      &avm1::Action::InstanceOf => unimplemented!("InstanceOf"),
      &avm1::Action::Jump(ref jump) => self.exec_jump(jump),
      &avm1::Action::Less => self.exec_less(),
      &avm1::Action::Less2 => unimplemented!("Less2"),
      &avm1::Action::MbAsciiToChar => unimplemented!("MbAsciiToChar"),
      &avm1::Action::MbCharToAscii => unimplemented!("MbCharToAscii"),
      &avm1::Action::MbStringExtract => unimplemented!("MbStringExtract"),
      &avm1::Action::MbStringLength => unimplemented!("MbStringLength"),
      &avm1::Action::Modulo => unimplemented!("Modulo"),
      &avm1::Action::Multiply => self.exec_multiply(),
      &avm1::Action::NewMethod => unimplemented!("NewMethod"),
      &avm1::Action::NewObject => unimplemented!("NewObject"),
      &avm1::Action::NextFrame => unimplemented!("NextFrame"),
      &avm1::Action::Not => self.exec_not(),
      &avm1::Action::Or => self.exec_or(),
      &avm1::Action::Play => unimplemented!("Play"),
      &avm1::Action::Pop => self.exec_pop(),
      &avm1::Action::PrevFrame => unimplemented!("PrevFrame"),
      &avm1::Action::Push(ref push) => self.exec_push(push),
      &avm1::Action::PushDuplicate => unimplemented!("PushDuplicate"),
      &avm1::Action::RandomNumber => unimplemented!("RandomNumber"),
      &avm1::Action::RemoveSprite => unimplemented!("RemoveSprite"),
      &avm1::Action::Return => unimplemented!("Return"),
      &avm1::Action::SetMember => unimplemented!("SetMember"),
      &avm1::Action::SetProperty => unimplemented!("SetProperty"),
      &avm1::Action::SetTarget(_) => unimplemented!("SetTarget"),
      &avm1::Action::SetTarget2 => unimplemented!("SetTarget2"),
      &avm1::Action::SetVariable => unimplemented!("SetVariable"),
      &avm1::Action::StackSwap => unimplemented!("StackSwap"),
      &avm1::Action::StartDrag => unimplemented!("StartDrag"),
      &avm1::Action::Stop => unimplemented!("Stop"),
      &avm1::Action::StopSounds => unimplemented!("StopSounds"),
      &avm1::Action::StoreRegister(_) => unimplemented!("StoreRegister"),
      &avm1::Action::StrictEquals => self.exec_strict_equals(),
      &avm1::Action::StringAdd => self.exec_string_add(),
      &avm1::Action::StringEquals => self.exec_string_equals(),
      &avm1::Action::StringExtract => unimplemented!("StringExtract"),
      &avm1::Action::StringGreater => unimplemented!("StringGreater"),
      &avm1::Action::StringLength => self.exec_string_length(),
      &avm1::Action::StringLess => unimplemented!("StringLess"),
      &avm1::Action::Subtract => self.exec_subtract(),
      &avm1::Action::TargetPath => unimplemented!("TargetPath"),
      &avm1::Action::ToInteger => unimplemented!("ToInteger"),
      &avm1::Action::ToNumber => unimplemented!("ToNumber"),
      &avm1::Action::ToString => unimplemented!("ToString"),
      &avm1::Action::ToggleQuality => unimplemented!("ToggleQuality"),
      &avm1::Action::Throw => unimplemented!("Throw"),
      &avm1::Action::Trace => self.exec_trace(),
      &avm1::Action::Try(_) => unimplemented!("Try"),
      &avm1::Action::TypeOf => unimplemented!("TypeOf"),
      &avm1::Action::WaitForFrame(_) => unimplemented!("WaitForFrame"),
      &avm1::Action::WaitForFrame2(_) => unimplemented!("WaitForFrame2"),
      &avm1::Action::With(_) => unimplemented!("With"),
      &avm1::Action::Unknown(_) => unimplemented!("Unknown"),
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
        let left = left.to_avm_string(self.vm.gc, self.vm.swf_version).unwrap();
        let right = right.to_avm_string(self.vm.gc, self.vm.swf_version).unwrap();
        let result = format!("{}{}", left.value(), right.value());
        self.frame.stack.push(AvmValue::String(AvmString::new(self.vm.gc, result).unwrap()));
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

  fn exec_constant_pool(&mut self, constant_pool: &avm1::actions::ConstantPool) -> () {
    let pool: Vec<Gc<'gc, AvmString>> = constant_pool.constant_pool
      .iter()
      .map(|s| AvmString::new(self.vm.gc, s.clone()).unwrap())
      .collect();
    self.vm.pool.set(pool);
  }

  fn exec_divide(&mut self) -> () {
    let right = self.frame.stack.pop().legacy_to_avm_number().value();
    let left = self.frame.stack.pop().legacy_to_avm_number().value();
    if right == 0f64 && self.vm.swf_version < 5 {
      self.frame.stack.push(AvmValue::String(AvmString::new(self.vm.gc, String::from("#ERROR#")).unwrap()))
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
    let key: String = String::from(self.frame.stack.pop().to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value());
    match self.frame.stack.pop() {
      AvmValue::Object(ref avm_object) => {
        self.frame.stack.push(avm_object.borrow().get(key))
      }
      _ => unimplemented!(),
    }
  }

  fn exec_get_variable(&mut self) -> () {
    let name = self.frame.stack.pop();
    let name = name.to_avm_string(self.vm.gc, self.vm.swf_version).unwrap();
    let value = self.frame.scope.get(name.value()).unwrap_or(AvmValue::UNDEFINED);
    self.frame.stack.push(value);
  }

  fn exec_init_array(&mut self) -> () {
    unimplemented!()
  }

  fn exec_init_object(&mut self) -> () {
    let property_count: usize = to_usize(self.frame.stack.pop()).unwrap();
    let obj: Gc<GcRefCell<AvmObject>> = AvmObject::new(self.vm.gc).unwrap();
    for _ in 0..property_count {
      let value: AvmValue = self.frame.stack.pop();
      let key: String = String::from(self.frame.stack.pop().to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value());
      obj.borrow_mut().set(key, value);
    }
    self.frame.stack.push(AvmValue::Object(obj))
  }

  fn exec_jump(&mut self, jump: &avm1::actions::Jump) -> () {
    const I16_MIN_SUCCESSOR: i16 = std::i16::MIN + 1;
    let new_offset: usize = match jump.offset {
      std::i16::MIN => self.frame.ip.saturating_sub(0x8000),
      x @ I16_MIN_SUCCESSOR..=-1 => self.frame.ip.saturating_sub(usize::from(-x as u16)),
      x @ 0..=std::i16::MAX => self.frame.ip.saturating_add(usize::from(x as u16)),
    };
    self.frame.ip = new_offset;
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
    for code_value in &push.values {
      let avm_value: Result<AvmValue<'gc>, GcAllocErr> = match code_value {
        &avm1::Value::Boolean(b) => Ok(AvmValue::boolean(b)),
        &avm1::Value::Constant(idx) => Ok(self.vm.pool.get(idx)),
        &avm1::Value::Float32(x) => Ok(AvmValue::number(x.into())),
        &avm1::Value::Float64(x) => Ok(AvmValue::number(x.into())),
        &avm1::Value::Null => Ok(AvmValue::NULL),
        &avm1::Value::Register(_idx) => unimplemented!("Push(Register)"),
        &avm1::Value::Sint32(x) => Ok(AvmValue::number(x.into())),
        &avm1::Value::String(ref s) => AvmString::new(self.vm.gc, s.clone())
          .map(|avm_string| AvmValue::String(avm_string)),
        &avm1::Value::Undefined => Ok(AvmValue::UNDEFINED),
      };
      let avm_value = avm_value.unwrap();
      self.frame.stack.push(avm_value);
    }
  }

  fn exec_strict_equals(&mut self) -> () {
    let right = self.frame.stack.pop();
    let left = self.frame.stack.pop();

    let result: bool = match (left, right) {
      (AvmValue::Boolean(l), AvmValue::Boolean(r)) => l.value() == r.value(),
      (AvmValue::Null(_), AvmValue::Null(_)) => true,
      (AvmValue::Number(l), AvmValue::Number(r)) => l.value() == r.value(),
      (AvmValue::Object(_l), AvmValue::Object(_r)) => unimplemented!("StrictEquals(Object, Object)"),
      (AvmValue::String(l), AvmValue::String(r)) => l.value() == r.value(),
      (AvmValue::Undefined(_), AvmValue::Undefined(_)) => true,
      _ => false,
    };

    self.frame.stack.push(AvmValue::boolean(result));
  }

  fn exec_string_add(&mut self) -> () {
    let right = self.frame.stack.pop().to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    let left = self.frame.stack.pop().to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    self.frame.stack.push(AvmValue::string(self.vm.gc, format!("{}{}", left, right)).unwrap());
  }

  fn exec_string_equals(&mut self) -> () {
    let right = self.frame.stack.pop().to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    let left = self.frame.stack.pop().to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
    let result = left == right;
    self.frame.stack.push(AvmValue::legacy_boolean(result, self.vm.swf_version));
  }

  fn exec_string_length(&mut self) -> () {
    let value = self.frame.stack.pop().to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value().to_string();
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
      avm_value => self.vm.host.trace(avm_value.to_avm_string(self.vm.gc, self.vm.swf_version).unwrap().value()),
    };
  }
}
