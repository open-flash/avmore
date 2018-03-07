use ::std::boxed::Box;
use ::std::cell::Cell;
use ::std::cell::RefCell;
use ::std::marker::PhantomData;
use ::std::mem::size_of;
use ::std::mem::size_of_val;
use ::std::ptr::NonNull;
use super::gc::Gc;
use super::gc_box::GcBox;
use super::trace::Trace;

#[derive(Ord, PartialOrd, Eq, PartialEq, Copy, Clone, Debug)]
pub enum GcAllocErr {
  Exhausted,
}

pub struct GcRootScope<'gcstatic> {
  state: RefCell<GcState<'gcstatic>>,
}

impl<'gcstatic> GcRootScope<'gcstatic> {
  pub fn new() -> GcRootScope<'gcstatic> {
    GcRootScope { state: RefCell::new(GcState::new()) }
  }

  /// Allocates `value` in this garbage-collected scope and returns a `Gc` smart pointer to it.
  ///
  /// It is written to prevent the following errors:
  ///
  /// ```compile_fail
  /// use avmore::gc::{Gc, GcRootScope, Trace};
  ///
  /// pub struct NamedObject {
  ///   pub name: String,
  /// }
  ///
  /// impl Trace for NamedObject {
  ///   fn trace(&self) {}
  ///   fn root(&self) {}
  ///   fn unroot(&self) {}
  /// }
  ///
  /// fn main() {
  ///   let message: Gc<NamedObject>;
  ///   {
  ///     let scope: GcRootScope = GcRootScope::new();
  ///     message = scope.alloc(NamedObject { name: String::from("Hello, World!") }).unwrap();
  ///   }
  ///   println!("{}", message.name);
  /// }
  /// ```
  ///
  /// ```compile_fail
  /// use avmore::gc::{Gc, GcRootScope, Trace};
  ///
  /// pub struct RefNamedObject<'a> {
  ///   pub name: &'a str,
  /// }
  ///
  /// impl<'a> Trace for RefNamedObject<'a> {
  ///   fn trace(&self) {}
  ///   fn root(&self) {}
  ///   fn unroot(&self) {}
  /// }
  ///
  /// fn main() {
  ///   let scope: GcRootScope = GcRootScope::new();
  ///   let message: Gc<RefNamedObject>;
  ///   {
  ///     let hello_world: String = String::from("Hello, World!");
  ///     message = scope.alloc(RefNamedObject { name: &hello_world }).unwrap();
  ///   }
  /// }
  /// ```
  pub fn alloc<'gc, T: Trace + 'gcstatic>(&'gc self, value: T) -> Result<Gc<'gc, T>, GcAllocErr> {
    value.unroot();
    self.state.borrow_mut()
      .alloc(value)
      .map(|ptr| Gc { ptr, phantom: PhantomData, rooted: Cell::new(true) })
  }

  pub fn collect_garbage(&self) {
    self.state.borrow_mut().collect_garbage()
  }
}

#[derive(Debug)]
struct GcState<'gcstatic> {
  pub allocated_bytes: usize,
  //  threshold: usize,
  // Linked-list of boxes
  pub boxes: Option<NonNull<GcBox<'gcstatic, Trace>>>,
}

impl<'gcstatic> GcState<'gcstatic> {
  pub fn new() -> GcState<'gcstatic> {
    GcState {
      allocated_bytes: 0,
      boxes: None,
    }
  }

  // Allocates GC-managed memory for T
  pub fn alloc<T: Trace + 'gcstatic>(&mut self, value: T) -> Result<NonNull<GcBox<'gcstatic, T>>, GcAllocErr> {
    // into_raw -> mem::forget, so we need to make sure we deallocate it ourselve
    let gc_box_ptr: *mut GcBox<T> = Box::into_raw(Box::new(GcBox {
      roots: Cell::new(1),
      marked: Cell::new(false),
      next: self.boxes,
      value: value,
    }));
    self.allocated_bytes += size_of::<GcBox<T>>();
    // We know that `gc_box` is not null so we can use `new_unchecked`
    self.allocated_bytes += size_of::<GcBox<T>>();
    let box_ptr: NonNull<GcBox<T>> = unsafe { NonNull::new_unchecked(gc_box_ptr) };
    self.boxes = Some(box_ptr);
    Ok(unsafe { NonNull::new_unchecked(gc_box_ptr) })
  }

  pub fn collect_garbage(&mut self) {
    {
      // Mark
      let mut next_gc_box_ptr = self.boxes;
      while let Some(gc_box_ptr) = next_gc_box_ptr {
        let gc_box: &GcBox<Trace> = unsafe { gc_box_ptr.as_ref() };
        if gc_box.roots.get() > 0 {
          gc_box.set_marked();
        }
        next_gc_box_ptr = gc_box.next;
      }
    }

    let mut unmarked: Vec<*mut GcBox<Trace>> = Vec::new();
    unsafe {
      // Collect
      let mut next_gc_box_ptr_ref = &mut self.boxes;
      while let Some(gc_box_ptr) = *next_gc_box_ptr_ref {
        let gc_box_ptr = gc_box_ptr.as_ptr();
        if (*gc_box_ptr).marked.get() {
          (*gc_box_ptr).marked.set(false);
          next_gc_box_ptr_ref = &mut (*gc_box_ptr).next;
        } else {
          *next_gc_box_ptr_ref = (*gc_box_ptr).next;
          unmarked.push(gc_box_ptr);
        }
      }
    }

    for gc_box_ptr in unmarked.iter() {
      let gc_box = unsafe { Box::from_raw(*gc_box_ptr) };
      self.allocated_bytes = self.allocated_bytes.checked_sub(size_of_val::<GcBox<_>>(gc_box.as_ref())).unwrap()
      // Implicitly drops `gc_box` and frees the associated memory
    }
  }
}

impl<'gcstatic> Drop for GcState<'gcstatic> {
  fn drop(&mut self) {
    let mut cur_box = self.boxes;
    while let Some(gc_box_ptr) = cur_box {
      let gc_box = unsafe { Box::from_raw(gc_box_ptr.as_ptr()) };
      cur_box = (*gc_box).next;
      // Implicitly drops `gc_box` and frees the associated memory
    }
  }
}
