extern crate avmore;
extern crate typed_arena;
extern crate swf_tree;

use avmore::context::Context;
use avmore::avm1::ExecutionContext;

use swf_tree::avm1 as avm1_tree;

fn main() {
  let ctx = Context::new(11);
  let mut ectx = ExecutionContext::new(&ctx);

  let actions: Vec<avm1_tree::Action> = vec![
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![avm1_tree::actions::Value::CString("1 + 1 =".to_string())]
    }),
    avm1_tree::Action::Trace,
    avm1_tree::Action::Push(avm1_tree::actions::Push {
      values: vec![avm1_tree::actions::Value::I32(1), avm1_tree::actions::Value::I32(1)]
    }),
    avm1_tree::Action::Add2,
    avm1_tree::Action::Trace,
  ];

  for action in actions {
    ectx.exec(&action);
  }
}
