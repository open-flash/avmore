use context::Context;
use avm1::ExecutionContext;
use values::AvmValue;
use values::AvmString;

use swf_tree::avm1 as avm1_tree;

#[test]
fn hello_world() {
  let ctx = Context::new(11);
  let mut ectx = ExecutionContext::new(&ctx);

  let actions: Vec<avm1_tree::Action> = vec![
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![avm1_tree::actions::Value::CString("Hello, World!".to_string())]
    }),
  ];

  for action in actions {
    ectx.exec(&action);
  }
  let result = ectx.pop();
  assert_eq!(result, AvmValue::String(AvmString::new(&ctx.scope, "Hello, World!")))
}
