use ::std::usize;
use context::Context;
use ::scoped_gc::{Gc, GcRefCell};
use swf_tree::avm1;
use values::{AvmNumber, AvmObject, AvmString, AvmUndefined, AvmValue};

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

pub struct ExecutionContext<'a, 'gc: 'a> {
  context: &'a Context<'gc>,
  stack: Stack<'gc>,
}

enum PreferredType {}

/// Implements ES-262-3 section 9.1 ("ToPrimitive")
fn to_primitive(value: AvmValue, _preferred_type: Option<PreferredType>) -> AvmValue {
  match value {
    AvmValue::Undefined(_) => value,
    AvmValue::Null(_) => value,
    AvmValue::Boolean(_) => value,
    AvmValue::Number(_) => value,
    AvmValue::String(_) => value,
    AvmValue::Object(_) => unimplemented!(),
  }
}

/// Implements ES-262-3 section 9.3 ("ToNumber")
fn to_number(value: AvmValue) -> AvmNumber {
  match value {
    AvmValue::Undefined(_) => AvmNumber::new(::std::f64::NAN),
    AvmValue::Null(_) => AvmNumber::new(0f64),
    AvmValue::Boolean(_) => unimplemented!(),
    AvmValue::Number(avm_number) => avm_number,
    AvmValue::String(_) => unimplemented!(),
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
    },
    _ => None,
  }
}

impl<'a, 'gc: 'a> ExecutionContext<'a, 'gc> {
  pub fn new(context: &'a Context<'gc>) -> ExecutionContext<'a, 'gc> {
    ExecutionContext {
      context,
      stack: Stack::new(),
    }
  }

  pub fn exec(&mut self, action: &avm1::Action) -> () {
    match action {
      &avm1::Action::Add => self.exec_add(),
      &avm1::Action::Add2 => self.exec_add2(),
      &avm1::Action::GetMember => self.exec_get_member(),
      &avm1::Action::InitArray => self.exec_init_array(),
      &avm1::Action::InitObject => self.exec_init_object(),
      &avm1::Action::Push(ref push) => self.exec_push(push),
      &avm1::Action::Trace => self.exec_trace(),
      _ => unimplemented!(),
    }
  }

  fn exec_add(&mut self) -> () {
    unimplemented!()
  }

  /// Implements the add operation as defined in ECMA-262-3, section 11.6.1
  /// ("The Addition operator ( + )")
  fn exec_add2(&mut self) -> () {
    let right = self.stack.pop();
    let left = self.stack.pop();
    let left = to_primitive(left, None);
    let right = to_primitive(right, None);
    match (left, right) {
      (left @ AvmValue::String(_), right) | (left, right @ AvmValue::String(_)) => {
        let left = left.to_avm_string(self.context.gc_scope, self.context.swf_version).unwrap();
        let right = right.to_avm_string(self.context.gc_scope, self.context.swf_version).unwrap();
        let result = format!("{}{}", left.value(), right.value());
        self.stack.push(AvmValue::String(AvmString::new(self.context.gc_scope, result).unwrap()));
      }
      (left, right) => {
        let left = to_number(left);
        let right = to_number(right);
        let result = left.value() + right.value();
        self.stack.push(AvmValue::Number(AvmNumber::new(result)));
      }
    }
  }

  fn exec_init_array(&mut self) -> () {
    unimplemented!();
  }

  fn exec_get_member(&mut self) -> () {
    let key: String = String::from(self.stack.pop().to_avm_string(self.context.gc_scope, self.context.swf_version).unwrap().value());
    match self.stack.pop() {
      AvmValue::Object(ref avm_object) => {
        self.stack.push(avm_object.borrow().get(key))
      },
      _ => unimplemented!(),
    }

//    let property_count: usize = to_usize().unwrap();
//    let obj: Gc<AvmObject> = AvmObject::new(self.context.gc_scope).unwrap();
//    for _ in 0..property_count {
//      let key: String = String::from(self.stack.pop().to_avm_string(self.context.gc_scope, self.context.swf_version).unwrap().value());
//      let value: AvmValue = self.stack.pop();
//      obj.set(key, value);
//    }
  }

  fn exec_init_object(&mut self) -> () {
    let property_count: usize = to_usize(self.stack.pop()).unwrap();
    let obj: Gc<GcRefCell<AvmObject>> = AvmObject::new(self.context.gc_scope).unwrap();
    for _ in 0..property_count {
      let key: String = String::from(self.stack.pop().to_avm_string(self.context.gc_scope, self.context.swf_version).unwrap().value());
      let value: AvmValue = self.stack.pop();
      obj.borrow_mut().set(key, value);
    }
    self.stack.push(AvmValue::Object(obj))
  }

  pub fn pop(&mut self) -> () {
    self.stack.pop();
  }

  fn exec_push(&mut self, push: &avm1::actions::Push) -> () {
    for value in &push.values {
      self.stack.push(AvmValue::from_ast(self.context.gc_scope, value).unwrap())
    }
  }

  fn exec_trace(&mut self) -> () {
    self.context.trace(
      self.stack.pop().to_avm_string(self.context.gc_scope, self.context.swf_version).unwrap().value()
    );
  }
}
