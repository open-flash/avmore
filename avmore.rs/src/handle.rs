//pub trait Handle<'a, T> {
//  fn get(&self) -> &'a T;
//}
//
////struct LocalHandle<'a, T> {
////}
//
//pub struct PersistentHandle<'a, T> {
//  value: &'a T,
//}
//
//impl<'a, T> Handle<'a, T> for PersistentHandle<'a, T> {
//  fn get(&self) -> &'a T {
//    self.value
//  }
//}
