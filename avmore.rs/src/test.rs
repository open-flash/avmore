use context::Context;
use avm1::ExecutionContext;
use host::LoggedHost;
use values::AvmValue;
use values::AvmString;

use swf_tree::avm1 as avm1_tree;

#[test]
fn hello_world() {
  let test_host = LoggedHost::new();
  let ctx = Context::new(11, &test_host);
  let mut ectx = ExecutionContext::new(&ctx);

  let actions: Vec<avm1_tree::Action> = vec![
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![avm1_tree::actions::Value::CString("Hello, World!".to_string())]
    }),
    avm1_tree::Action::Trace,
  ];

  for action in actions {
    ectx.exec(&action);
  }

  let expected_logs = vec![
    "Hello, World!",
  ];

  assert_eq!(*test_host.logs.borrow(), expected_logs);
}

#[test]
fn one_plus_one_equals_two() {
  let test_host = LoggedHost::new();
  let ctx = Context::new(11, &test_host);
  let mut ectx = ExecutionContext::new(&ctx);

  let actions: Vec<avm1_tree::Action> = vec![
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![
        avm1_tree::actions::Value::CString("1 + 1 = ".to_string()),
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

  assert_eq!(*test_host.logs.borrow(), expected_logs);
}
