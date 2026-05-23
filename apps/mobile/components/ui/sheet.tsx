import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
} from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
  type BottomSheetModalProps,
} from "@gorhom/bottom-sheet";
import type { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { cn } from "@/lib/cn";
import { useThemeColor } from "@/lib/theme-colors";

/**
 * Mobile Sheet primitive — wraps `@gorhom/bottom-sheet`'s `BottomSheetModal`
 * to keep the same `<Sheet open onOpenChange children />` API the rest of
 * the codebase already consumes (no call site changes required).
 *
 * Design choices:
 *   • `BottomSheetModal` is portal-rendered above the navigation Stack
 *     when the root `<BottomSheetModalProvider>` is mounted (see
 *     `apps/mobile/app/_layout.tsx`).
 *   • Drag-to-dismiss is native (`enablePanDownToClose`) — we no longer
 *     reimplement the gesture ourselves.
 *   • The backdrop fade is animated by the lib (interpolated to the
 *     sheet's vertical position) and dismisses on press.
 *   • By default we use `enableDynamicSizing` so the sheet hugs its
 *     content (capped at 90% of the screen) — callers with scrollable
 *     bodies should pass explicit `snapPoints` and use `SheetScrollView`
 *     / `SheetFlatList` so vertical gestures are forwarded to the lib.
 *   • Keyboard behavior is tuned for forms (interactive resize on iOS,
 *     `adjustResize` on Android) so the input stays visible when the
 *     keyboard opens (offer-bar, address-autocomplete, sell forms).
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /**
   * Optional sticky footer rendered outside the scrollable area. Useful
   * for action buttons (Reset / Apply) that must stay visible even when
   * the sheet body is scrollable.
   */
  footer?: React.ReactNode;
  /**
   * Snap points expressed either as percentage strings (e.g. `"75%"`)
   * or absolute pixel numbers. When omitted, the sheet uses dynamic
   * sizing (hugs content, capped at 90% screen).
   */
  snapPoints?: (string | number)[];
};

export function Sheet({
  open,
  onOpenChange,
  children,
  className,
  footer,
  snapPoints,
}: Props) {
  const ref = useRef<BottomSheetModal>(null);
  // Tracks whether the modal is currently presented (mounted + visible).
  // `@gorhom/bottom-sheet` v5 has a footgun: calling `dismiss()` while
  // its internal `statusRef` is INITIAL (which happens after the lib
  // self-unmounts on pan-close, AND on first mount) silently corrupts
  // the status to DISMISSING — every future `handlePortalRender` is
  // then short-circuited, so the modal mounts but renders nothing.
  // We mirror the lib's mount state via `onChange`/`onDismiss` and only
  // forward dismissals when the sheet is actually presented.
  const isPresentedRef = useRef(false);
  const { height: windowH } = useWindowDimensions();
  const cardBg = useThemeColor("card");
  const handleColor = useThemeColor("mutedForeground");

  // Present / dismiss in sync with the `open` prop. Imperative API rather
  // than declarative because the lib has no `visible` prop.
  useEffect(() => {
    if (open) {
      isPresentedRef.current = true;
      ref.current?.present();
    } else if (isPresentedRef.current) {
      // Only dismiss when the sheet is currently presented. If the lib
      // already self-dismissed (pan-down / backdrop), its status is back
      // to INITIAL and calling dismiss() again corrupts it to DISMISSING.
      isPresentedRef.current = false;
      ref.current?.dismiss();
    }
  }, [open]);

  const handleChange = useCallback(
    (index: number) => {
      // Mirror the lib's mount state so the dismiss-guard in useEffect
      // can tell whether we're already unmounted (index === -1 happens
      // when the user drags-down or taps the backdrop).
      isPresentedRef.current = index >= 0;
      if (index === -1) onOpenChange(false);
    },
    [onOpenChange],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={0.5}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) =>
      footer ? (
        <BottomSheetFooter
          {...props}
          bottomInset={0}
          style={{ backgroundColor: cardBg }}
        >
          <View className="border-t border-border bg-card px-4 pb-6 pt-3">
            {footer}
          </View>
        </BottomSheetFooter>
      ) : null,
    [footer, cardBg],
  );

  // Resolve the union to the precise types the lib expects — string snap
  // points must be widened to a tuple of strings, numeric ones to numbers.
  const resolvedSnapPoints = useMemo(
    () => (snapPoints && snapPoints.length > 0 ? snapPoints : undefined),
    [snapPoints],
  );

  const enableDynamicSizing = !resolvedSnapPoints;

  return (
    <BottomSheetModal
      ref={ref}
      onChange={handleChange}
      onDismiss={() => {
        // The lib reset its status to INITIAL via unmount(). Stay in sync.
        isPresentedRef.current = false;
      }}
      snapPoints={resolvedSnapPoints as BottomSheetModalProps["snapPoints"]}
      enableDynamicSizing={enableDynamicSizing}
      maxDynamicContentSize={windowH * 0.9}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      footerComponent={footer ? renderFooter : undefined}
      backgroundStyle={{ backgroundColor: cardBg }}
      handleIndicatorStyle={{ backgroundColor: handleColor, opacity: 0.5 }}
      // The `topInset` keeps the sheet just below the system status bar
      // on Android when expanded to a tall snap point.
      topInset={Platform.OS === "android" ? 8 : 0}
    >
      <BottomSheetView
        style={{
          // Top padding only — `BottomSheetFooter` floats above content,
          // and consumers that scroll should add their own bottom padding
          // (≈ footer height) to clear it. Non-scrollable sheets get the
          // default 16dp gap before the safe-area handle.
          paddingBottom: footer ? 0 : 16,
        }}
        className={cn("flex-1 px-4 pt-2", className)}
      >
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

/**
 * `BottomSheetScrollView` re-export — required for scrollable content
 * inside a Sheet so the lib can route vertical gestures correctly. Drop
 * this in place of `ScrollView` whenever a Sheet body scrolls.
 */
type SheetScrollViewProps = ComponentProps<typeof BottomSheetScrollView>;

export const SheetScrollView = forwardRef<
  React.ComponentRef<typeof BottomSheetScrollView>,
  SheetScrollViewProps
>(function SheetScrollView({ className, ...props }, ref) {
  return (
    <BottomSheetScrollView ref={ref} {...props} className={cn(className)} />
  );
});

/**
 * `BottomSheetFlatList` re-export with the same rationale as
 * `SheetScrollView`. Use for long lists (e.g. address suggestions).
 */
type SheetFlatListProps<TItem> = ComponentProps<
  typeof BottomSheetFlatList<TItem>
>;

export function SheetFlatList<TItem>(props: SheetFlatListProps<TItem>) {
  return <BottomSheetFlatList<TItem> {...props} />;
}

// Re-export the imperative API for advanced consumers (rare).
export type { BottomSheetMethods as SheetMethods };
