interface ConditionalWrapProps {
  children: JSX.Element | JSX.Element[];
  condition: boolean;
  wrap: (children: JSX.Element | JSX.Element[]) => JSX.Element;
}

export const ConditionalWrap = ({ condition, wrap, children }: ConditionalWrapProps): JSX.Element =>
  condition ? wrap(children) : <>{children}</>;