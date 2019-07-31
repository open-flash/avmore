use ::std::cell::RefCell;

use crate::error::Warning;

pub trait Host {
  fn trace(&self, message: &str) -> ();

  fn warn(&self, warning: &Warning) -> ();
}

pub struct NativeHost;

impl NativeHost {
  pub fn new() -> NativeHost { NativeHost }
}

impl Host for NativeHost {
  fn trace(&self, message: &str) -> () {
    println!("{}", message);
  }

  fn warn(&self, warning: &Warning) -> () {
    eprintln!("{}", warning.to_string());
  }
}

pub struct NoOpHost;

impl Host for NoOpHost {
  fn trace(&self, _message: &str) -> () {}

  fn warn(&self, _warning: &Warning) -> () {}
}

pub struct LoggedHost {
  pub logs: RefCell<Vec<String>>,
}

impl LoggedHost {
  pub fn new() -> LoggedHost {
    LoggedHost {
      logs: RefCell::new(Vec::new()),
    }
  }
}

impl Host for LoggedHost {
  fn trace(&self, message: &str) -> () {
    self.logs.borrow_mut().push(message.to_string());
  }

  fn warn(&self, warning: &Warning) -> () {
    self.logs.borrow_mut().push(warning.to_string());
  }
}
