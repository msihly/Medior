import { ComponentType } from "react";
import { observer } from "mobx-react-lite";

export const Comp = <T extends ComponentType<any>>(component: T): T => {
  return observer(component as any) as T;
};