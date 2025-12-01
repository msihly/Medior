import { forwardRef, MutableRefObject } from "react";
import { observer } from "mobx-react-lite";

type Forwarded = (props: any, ref: MutableRefObject<any>) => any;

type Comp<C extends Forwarded> = <Props = Parameters<C>[0], Ref = Parameters<C>[1]>(
  props: Props,
  ref: Ref,
) => ReturnType<C>;

export const Comp = <C extends Forwarded>(component: C): Comp<C> => {
  type Props = Parameters<C>[0];
  type Ref = Parameters<C>[1];

  const Wrapped = forwardRef<Ref, Props>((props, ref) =>
    component(props, ref as MutableRefObject<Ref>),
  );

  return observer(Wrapped as any) as Comp<C>;
};
