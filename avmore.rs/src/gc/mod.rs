pub use gc::gc::Gc;
pub use gc::gc_ref_cell::GcRefCell;
pub use gc::gc_state::{GcAllocErr, GcRootScope};
pub use gc::trace::Trace;

pub mod gc;
pub mod gc_ref_cell;
mod gc_box;
pub mod gc_state;
pub mod trace;

#[cfg(test)]
mod test;
