use swf_tree::avm1;
use context::Context;
use scope::Scope;
use values::{AvmValue, AvmUndefined, AvmNumber, AvmString};

struct Stack<'a> {
  inner: Vec<AvmValue<'a>>,
}

impl<'a> Stack<'a> {
  pub fn new() -> Stack<'a> {
    Stack { inner: Vec::new() }
  }

  pub fn pop(&mut self) -> AvmValue<'a> {
    self.inner.pop().unwrap_or(AvmValue::Undefined(AvmUndefined()))
  }

  pub fn push(&mut self, value: AvmValue<'a>) {
    self.inner.push(value);
  }
}

pub struct ExecutionContext<'a> {
  context: &'a Context<'a>,
  stack: Stack<'a>,
}

enum PreferredType {

}

/// Implements ES-262-3 section 9.1 ("ToPrimitive")
fn to_primitive(value: AvmValue, preferred_type: Option<PreferredType>) -> AvmValue {
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
fn to_number(scope: &Scope, value: AvmValue) -> AvmNumber {
  match value {
    AvmValue::Undefined(_) => AvmNumber::new(scope, ::std::f64::NAN),
    AvmValue::Null(_) => AvmNumber::new(scope, 0f64),
    AvmValue::Boolean(_) => unimplemented!(),
    AvmValue::Number(avm_number) => avm_number,
    AvmValue::String(_) => unimplemented!(),
    AvmValue::Object => unimplemented!(),
  }
}

impl<'a> ExecutionContext<'a> {
  pub fn new(context: &'a Context) -> ExecutionContext<'a> {
    ExecutionContext {
      context,
      stack: Stack::new(),
    }
  }

  pub fn exec(&mut self, action: &avm1::Action) -> () {
    match action {
      &avm1::Action::Push(ref push) => self.exec_push(push),
      &avm1::Action::Trace => self.exec_trace(),
      &avm1::Action::Add2 => self.exec_add2(),
      _ => unimplemented!(),
    }
  }

  pub fn pop(&'a mut self) -> AvmValue<'a> {
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
        let left = left.to_avm_string(&self.context.scope, self.context.swf_version);
        let right = right.to_avm_string(&self.context.scope, self.context.swf_version);
        let result = format!("{}{}", left.to_str(), right.to_str());
        self.stack.push(AvmValue::String(AvmString::new(&self.context.scope, &result)));
      },
      (left, right) => {
        let left = to_number(&self.context.scope, left);
        let right = to_number(&self.context.scope, right);
        let result = left.to_f64() + right.to_f64();
        self.stack.push(AvmValue::Number(AvmNumber::new(&self.context.scope, result)));
      }
    }
  }

  fn exec_push(&mut self, push: &avm1::actions::Push) -> () {
    for value in &push.values {
      let avm_value: AvmValue = AvmValue::from_ast(&self.context.scope, value);
      self.stack.push(avm_value)
    }
  }

  fn exec_trace(&mut self) -> () {
    self.context.trace(
      self.stack.pop().to_avm_string(&self.context.scope, self.context.swf_version).to_str()
    );
  }
}
