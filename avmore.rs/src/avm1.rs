use context::Context;
use swf_tree::avm1;
use values::{AvmNumber, AvmString, AvmUndefined, AvmValue};

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

pub struct ExecutionContext<'a, 'gc: 'a, 'gcstatic: 'gc> {
  context: &'a Context<'gc, 'gcstatic>,
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
    AvmValue::Object => unimplemented!(),
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
    AvmValue::Object => unimplemented!(),
  }
}

impl<'a, 'gc, 'gcstatic: 'gc> ExecutionContext<'a, 'gc, 'gcstatic> {
  pub fn new(context: &'a Context<'gc, 'gcstatic>) -> ExecutionContext<'a, 'gc, 'gcstatic> {
    ExecutionContext {
      context,
      stack: Stack::new(),
    }
  }

  pub fn exec(&mut self, action: &avm1::Action) -> () {
    match action {
      &avm1::Action::Add2 => self.exec_add2(),
      &avm1::Action::InitArray => self.exec_init_array(),
      &avm1::Action::Push(ref push) => self.exec_push(push),
      &avm1::Action::Trace => self.exec_trace(),
      _ => unimplemented!(),
    }
  }

  pub fn pop(&mut self) -> AvmValue {
    self.stack.pop()
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
