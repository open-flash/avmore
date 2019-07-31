#[derive(Debug, Eq, PartialEq, Clone)]
pub struct ReferenceToUndeclaredVariableWarning {
  pub variable: String,
}

impl std::fmt::Display for ReferenceToUndeclaredVariableWarning {
  fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
    write!(f, "Warning: Reference to undeclared variable, '{}'", self.variable)
  }
}

#[derive(Debug, Eq, PartialEq, Clone)]
pub enum Warning {
  ReferenceToUndeclaredVariable(ReferenceToUndeclaredVariableWarning),
}

impl std::fmt::Display for Warning {
  fn fmt(&self, f: &mut std::fmt::Formatter) -> Result<(), std::fmt::Error> {
    match self {
      &Warning::ReferenceToUndeclaredVariable(ref w) => w.fmt(f)
    }
  }
}
