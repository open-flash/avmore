use ::std::cell::Cell;
use ::std::ptr::NonNull;
use super::trace::Trace;

// Private: keeps track of the roots and marked state
#[derive(Debug)]
pub struct GcBox<'gcstatic, T: Trace + ? Sized + 'gcstatic> {
  // 8 bytes
  pub roots: Cell<usize>,
  // 1 byte
  pub marked: Cell<bool>,
  // 16 bytes
  pub next: Option<NonNull<GcBox<'gcstatic, Trace>>>,
  pub value: T,
}

impl<'gcstatic, T: Trace + ? Sized + 'gcstatic> GcBox<'gcstatic, T> {
  // TODO: rename to `mark_and_trace_sub`?
  pub fn set_marked(&self) {
    if !self.marked.get() {
      self.marked.set(true);
      self.value.trace()
    }
  }

  pub fn inc_roots(&self) {
    self.roots.set(self.roots.get().checked_add(1).unwrap())
  }

  pub fn dec_roots(&self) {
    self.roots.set(self.roots.get().checked_sub(1).unwrap())
  }
}
