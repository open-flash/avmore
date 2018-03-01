use ::std::cell::RefCell;

pub trait Host {
  fn trace(&self, message: &str);
}

pub struct NativeHost();

impl Host for NativeHost {
  fn trace(&self, message: &str) {
    println!("{}", message);
  }
}

pub struct NoOpHost();

impl Host for NoOpHost {
  fn trace(&self, message: &str) {}
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
  fn trace(&self, message: &str) {
    self.logs.borrow_mut().push(message.to_string());
  }
}
