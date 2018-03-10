use avm1::ExecutionContext;
use context::Context;
use ::scoped_gc::GcScope;
use host::LoggedHost;
use swf_tree::avm1 as avm1_tree;
use values::{AvmString, AvmValue};

#[test]
fn avm_value_eq() {
  let gc_scope = GcScope::new();

  let ast_val = avm1_tree::actions::Value::CString(String::from("Hello, World!"));

  let foo = AvmValue::from_ast(&gc_scope, &ast_val).unwrap();

  assert_eq!(foo, AvmValue::String(AvmString::new(&gc_scope, String::from("Hello, World!")).unwrap()));
}

#[test]
fn hello_world() {
  let host = LoggedHost::new();
  let gc_scope = GcScope::new();
  let ctx = Context::new(&host, &gc_scope, 11);

  let mut ectx = ExecutionContext::new(&ctx);

  let actions: Vec<avm1_tree::Action> = vec![
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![avm1_tree::actions::Value::CString(String::from("Hello, World!"))]
    }),
    avm1_tree::Action::Trace,
  ];

  for action in actions {
    ectx.exec(&action);
  }

  let expected_logs = vec![
    "Hello, World!",
  ];

  assert_eq!(*host.logs.borrow(), expected_logs);
}

#[test]
fn one_plus_one_equals_two() {
  let host = LoggedHost::new();
  let gc_scope = GcScope::new();
  let ctx = Context::new(&host, &gc_scope, 11);

  let mut ectx = ExecutionContext::new(&ctx);

  let actions: Vec<avm1_tree::Action> = vec![
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![
        avm1_tree::actions::Value::CString(String::from("1 + 1 = ")),
        avm1_tree::actions::Value::I32(1),
        avm1_tree::actions::Value::I32(1),
      ]
    }),
    avm1_tree::Action::Add2,
    avm1_tree::Action::Add2,
    avm1_tree::Action::Trace,
  ];

  for action in actions {
    ectx.exec(&action);
  }

  let expected_logs = vec![
    "1 + 1 = 2",
  ];

  assert_eq!(*host.logs.borrow(), expected_logs);
}

#[test]
fn read_object() {
  let host = LoggedHost::new();
  let gc_scope = GcScope::new();
  let ctx = Context::new(&host, &gc_scope, 11);

  let mut ectx = ExecutionContext::new(&ctx);

  let actions: Vec<avm1_tree::Action> = vec![
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![
        avm1_tree::actions::Value::CString(String::from("Hello, World!")),
        avm1_tree::actions::Value::CString(String::from("foo")),
        avm1_tree::actions::Value::I32(1),
      ]
    }),
    avm1_tree::Action::InitObject,
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![
        avm1_tree::actions::Value::CString(String::from("foo")),
      ]
    }),
    avm1_tree::Action::GetMember,
    avm1_tree::Action::Trace,
  ];

  for action in actions {
    ectx.exec(&action);
  }

  let expected_logs = vec![
    "Hello, World!",
  ];

  assert_eq!(*host.logs.borrow(), expected_logs);
}

//#[test]
//fn array_access() {
//  let test_host = LoggedHost::new();
//  let mut gc_state = GcState::new();
//
//  let ctx = Context::new(11, &test_host);
//  let mut ectx = ExecutionContext::new(&ctx);
//
//  let actions: Vec<avm1_tree::Action> = vec![
//    avm1_tree::Action::Push(avm1_tree::actions::Push {
//      values: vec![
//        avm1_tree::actions::Value::I32(6),
//        avm1_tree::actions::Value::I32(4),
//        avm1_tree::actions::Value::I32(2),
//        avm1_tree::actions::Value::F64(::ordered_float::OrderedFloat::<f64>(0f64)),
//        avm1_tree::actions::Value::I32(4),
//      ]
//    }),
//    avm1_tree::Action::InitArray,
//    avm1_tree::Action::Push(avm1_tree::actions::Push {
//      values: vec![
//        avm1_tree::actions::Value::I32(2),
//      ]
//    }),
//    avm1_tree::Action::GetMember,
//    avm1_tree::Action::Trace,
//  ];
//
//  for action in actions {
//    ectx.exec(&action);
//  }
//
//  let expected_logs = vec![
//    "4",
//  ];
//
//  assert_eq!(*test_host.logs.borrow(), expected_logs);
//}
