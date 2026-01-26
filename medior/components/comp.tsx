import { forwardRef, ForwardRefExoticComponent, PropsWithoutRef, Ref, RefAttributes } from "react";
import { observer } from "mobx-react-lite";

type Forwarded<P, R> = (props: P, ref: Ref<R>) => JSX.Element;

export function Comp<P, R = HTMLDivElement>(
  component: Forwarded<P, R>,
): ForwardRefExoticComponent<PropsWithoutRef<P> & RefAttributes<R>> {
  const Wrapped = forwardRef<R, P>(component);
  return observer(Wrapped);
}
