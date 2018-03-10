//extern crate avmore;
//extern crate swf_tree;
//extern crate typed_arena;
//
//use avmore::avm1::ExecutionContext;
//use avmore::context::Context;
//use avmore::gc::GcRootScope;
//use avmore::host::NativeHost;
//use swf_tree::avm1 as avm1_tree;
//
//fn main() {
//  let host = NativeHost::new();
//  let gc_scope = GcRootScope::new();
//  let ctx = Context::new(&host, &gc_scope, 11);
//
//  let mut ectx = ExecutionContext::new(&ctx);
//
//  let actions: Vec<avm1_tree::Action> = vec![
//    avm1_tree::Action::Push(avm1_tree::actions::Push {
//      values: vec![
//        avm1_tree::actions::Value::CString(String::from("1 + 1 = ")),
//        avm1_tree::actions::Value::I32(1),
//        avm1_tree::actions::Value::I32(1),
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
//}
