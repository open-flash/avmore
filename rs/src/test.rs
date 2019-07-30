use ::scoped_gc::GcScope;
use avm1_tree;

use crate::avm1::Vm;
use crate::host::LoggedHost;
use crate::values::{AvmString, AvmValue};
use ::test_generator::test_expand_paths;

#[test]
fn avm_value_eq() {
  let gc_scope = GcScope::new();

  let ast_val = avm1_tree::Value::String(String::from("Hello, World!"));

  let foo = AvmValue::from_ast(&gc_scope, &ast_val).unwrap();

  assert_eq!(foo, AvmValue::String(AvmString::new(&gc_scope, String::from("Hello, World!")).unwrap()));
}

test_expand_paths! { test_avm1; "../tests/avm1/*/*/main.avm1" }
fn test_avm1(path: &str) {
  let log_path: String = path.replace(".avm1", ".log");
  let avm1_bytes: Vec<u8> = ::std::fs::read(path).expect("Failed to read AVM1 file");
  let expected_logs: String = ::std::fs::read_to_string(log_path).expect("Failed to read log");

  let gc = GcScope::new();
  let host = LoggedHost::new();
  let mut vm = Vm::new(&gc, &host, 11);
  let script_id = vm.create_script(avm1_bytes, None, None);
  vm.run_to_completion(script_id);

  let actual_logs = host.logs.borrow().join("\n") + "\n";

  assert_eq!(actual_logs, expected_logs);
}

//#[test]
//fn one_plus_one_equals_two() {
//  let host = LoggedHost::new();
//  let gc_scope = GcScope::new();
//  let ctx = Context::new(&host, &gc_scope, 11);
//
//  let mut ectx = ExecutionContext::new(&ctx);
//
//  let actions: Vec<avm1_tree::Action> = vec![
//    avm1_tree::Action::Push(avm1_tree::actions::Push {
//      values: vec![
//        avm1_tree::Value::String(String::from("1 + 1 = ")),
//        avm1_tree::Value::Sint32(1),
//        avm1_tree::Value::Sint32(1),
//      ]
//    }),
//    avm1_tree::Action::Add2,
//    avm1_tree::Action::Add2,
//    avm1_tree::Action::Trace,
//  ];
//
//  for action in actions {
//    ectx.exec(&action);
//  }
//
//  let expected_logs = vec![
//    "1 + 1 = 2",
//  ];
//
//  assert_eq!(*host.logs.borrow(), expected_logs);
//}

//#[test]
//fn read_object() {
//  let host = LoggedHost::new();
//  let gc_scope = GcScope::new();
//  let ctx = Context::new(&host, &gc_scope, 11);
//
//  let mut ectx = ExecutionContext::new(&ctx);
//
//  let actions: Vec<avm1_tree::Action> = vec![
//    avm1_tree::Action::Push(avm1_tree::actions::Push {
//      values: vec![
//        avm1_tree::Value::String(String::from("Hello, World!")),
//        avm1_tree::Value::String(String::from("foo")),
//        avm1_tree::Value::Sint32(1),
//      ]
//    }),
//    avm1_tree::Action::InitObject,
//    avm1_tree::Action::Push(avm1_tree::actions::Push {
//      values: vec![
//        avm1_tree::Value::String(String::from("foo")),
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
//    "Hello, World!",
//  ];
//
//  assert_eq!(*host.logs.borrow(), expected_logs);
//}

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
