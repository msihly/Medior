import { useState } from "react";
import { Comp, IconButton } from "medior/components";
import { colors } from "medior/utils/client";
import { Input, InputProps } from "./input";

/** A key or token, hidden until its eye button shows it. */
export const SecretInput = Comp((props: InputProps) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisible = () => setIsVisible(!isVisible);

  return (
    <Input
      {...props}
      type={isVisible ? "text" : "password"}
      adornment={
        <IconButton
          name={isVisible ? "VisibilityOff" : "Visibility"}
          onClick={toggleVisible}
          tooltip={isVisible ? "Hide" : "Show"}
          color={colors.custom.grey}
          size="small"
        />
      }
      // Inputs show their value on hover, which a hidden one must not.
      slotProps={isVisible ? undefined : { htmlInput: { title: undefined } }}
    />
  );
});
