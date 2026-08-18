import { forwardRef, type ComponentProps, type ComponentRef } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type FormScrollViewProps = ComponentProps<typeof KeyboardAwareScrollView>;

/**
 * Scroll container for forms.
 *
 * Unlike a plain ScrollView inside a KeyboardAvoidingView, this component
 * actively scrolls the focused input above the keyboard on both Android
 * edge-to-edge and iOS.
 */
export const FormScrollView = forwardRef<
  ComponentRef<typeof KeyboardAwareScrollView>,
  FormScrollViewProps
>(function FormScrollView(
  {
    bottomOffset = 24,
    keyboardShouldPersistTaps = "handled",
    keyboardDismissMode = "interactive",
    style,
    ...props
  },
  ref,
) {
  return (
    <KeyboardAwareScrollView
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      style={[{ flex: 1 }, style]}
      {...props}
    />
  );
});
