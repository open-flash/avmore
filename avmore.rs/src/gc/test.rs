use ::std::cell::{Cell, RefCell};
use ::std::rc::Rc;
use gc::gc_box::GcBox;
use super::gc::Gc;
use super::gc_ref_cell::GcRefCell;
use super::gc_state::GcRootScope;
use super::trace::Trace;

////////////////////////////////////////////////////////////////////////////////////////////////////

#[derive(Debug)]
pub struct RefNamedObject<'n> {
  pub name: &'n str,
}

impl<'n> Trace for RefNamedObject<'n> {
  fn trace(&self) {}
  fn root(&self) {}
  fn unroot(&self) {}
}

#[derive(Debug)]
pub struct NamedObject {
  pub name: String,
}

impl Trace for NamedObject {
  fn trace(&self) {}
  fn root(&self) {}
  fn unroot(&self) {}
}

////////////////////////////////////////////////////////////////////////////////////////////////////

impl NamedObject {
  // Allocates a `NamedObject` using `GcScope` and returns a smart pointer to it.
  pub fn new<'a, 'c: 'a>(gc_scope: &'a GcRootScope<'c>, name: String) -> Gc<'a, NamedObject> {
    unimplemented!();
//    gc_scope.alloc(NamedObject { name })
  }
}

impl<'n> RefNamedObject<'n> {
  // Allocates a `NamedObject` using `GcScope` and returns a smart pointer to it.
  pub fn new<'a, 'c: 'a>(gc_scope: &'a GcRootScope<'c>, name: &'a str) -> Gc<'a, RefNamedObject<'a>> {
    unimplemented!();
//    gc_scope.alloc(RefNamedObject { name }).unwrap()
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////

#[test]
fn test_gc() {
  let a: String = String::from("Hello, World!");
  {
    let scope: GcRootScope = GcRootScope::new();
    let d: Gc<NamedObject>;
    {
      let b: Gc<NamedObject> = scope.alloc(NamedObject { name: a.clone() }).unwrap();
      let c: Gc<NamedObject> = scope.alloc(NamedObject { name: a.clone() }).unwrap();
      d = c;
    }
  }
  assert_eq!(format!("{}", a), String::from("Hello, World!"));
}

#[test]
fn test_gc_ref() {
  let a: String = String::from("Hello, World!");
  {
    let scope: GcRootScope = GcRootScope::new();
    let d: Gc<RefNamedObject>;
    {
      let b: Gc<RefNamedObject> = scope.alloc(RefNamedObject { name: &a }).unwrap();
      let c: Gc<RefNamedObject> = scope.alloc(RefNamedObject { name: &a }).unwrap();
      d = c;
    }
  }
  assert_eq!(format!("{}", a), String::from("Hello, World!"));
}

////////////////////////////////////////////////////////////////////////////////////////////////////

fn indirect<'r, 's: 'r, 'gc: 's, T: Trace + 'gc>(scope: &'s GcRootScope<'gc>, value: T) -> Gc<'r, T> {
  scope.alloc(value).unwrap()
}

#[test]
fn indirect_test_gc() {
  let a: String = String::from("Hello, World!");
  {
    let scope: GcRootScope = GcRootScope::new();
    let d: Gc<NamedObject>;
    {
      let b: Gc<NamedObject> = indirect(&scope, NamedObject { name: a.clone() });
      let c: Gc<NamedObject> = indirect(&scope, NamedObject { name: a.clone() });
      d = c;
    }
  }
  assert_eq!(format!("{}", a), String::from("Hello, World!"));
}

#[test]
fn indirect_should_not_compile() {
//  let d: Gc<NamedObject>;
//  let a: String = String::from("Hello, World!");
//  {
//    let scope: GcRootScope = GcRootScope::new();
//    d = indirect(&scope, NamedObject { name: a.clone() });
//  }
}

#[test]
fn indirect_test_gc_ref() {
  let a: String = String::from("Hello, World!");
  {
    let scope: GcRootScope = GcRootScope::new();
    let d: Gc<RefNamedObject>;
    {
      let b: Gc<RefNamedObject> = indirect(&scope, RefNamedObject { name: &a });
      let c: Gc<RefNamedObject> = indirect(&scope, RefNamedObject { name: &a });
      d = c;
    }
  }
  assert_eq!(format!("{}", a), String::from("Hello, World!"));
}

#[test]
fn indirect_should_not_compile_ref() {
//  let scope: GcRootScope = GcRootScope::new();
//  let d: Gc<RefNamedObject>;
//  {
//    let a: String = String::from("Hello, World!");
//    let b: Gc<RefNamedObject> = indirect(&scope, RefNamedObject { name: &a });
//    let c: Gc<RefNamedObject> = indirect(&scope, RefNamedObject { name: &a });
//    d = c;
//  }
}
