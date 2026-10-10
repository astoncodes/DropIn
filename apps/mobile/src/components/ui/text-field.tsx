import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';

import { radius, space, usePalette } from '../../theme';
import { AppText } from './primitives';

type TextFieldProps = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Guidance shown under the field until there is an error to show instead. */
  hint?: string;
  error?: string | null;
  /** Show "12/500" under the field. Needs `maxLength`. */
  showCount?: boolean;
  /** Hide the visible label when the surrounding UI already names the field. */
  labelHidden?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * The one text input style in the app.
 *
 * The label is real text above the field rather than a placeholder, because a
 * placeholder disappears the moment someone starts typing and is too faint to
 * read as a label. Errors replace the hint in the same position, so the layout
 * does not jump, and are announced politely to screen readers.
 */
export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  showCount,
  labelHidden,
  maxLength,
  multiline,
  editable = true,
  containerStyle,
  ...inputProps
}: TextFieldProps) {
  const colors = usePalette();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.alert : focused ? colors.text : colors.borderStrong;
  const helper = error ?? hint;

  return (
    <View style={[styles.container, containerStyle]}>
      {!labelHidden && (
        <AppText variant="caption" style={styles.label}>
          {label}
        </AppText>
      )}
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        multiline={multiline}
        editable={editable}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        accessibilityHint={helper ?? undefined}
        accessibilityState={{ disabled: !editable }}
        placeholderTextColor={colors.textFaint}
        onFocus={(event) => {
          setFocused(true);
          inputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          inputProps.onBlur?.(event);
        }}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: colors.text,
            backgroundColor: editable ? colors.surface : colors.surfaceMuted,
            borderColor,
          },
        ]}
      />
      {(helper || (showCount && maxLength)) && (
        <View style={styles.footer}>
          {helper ? (
            <View style={{ flex: 1 }} accessibilityLiveRegion={error ? 'polite' : 'none'}>
              <AppText variant="caption" tone={error ? 'alert' : 'muted'}>
                {helper}
              </AppText>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {showCount && maxLength ? (
            <AppText variant="caption" tone="faint">
              {value.length}/{maxLength}
            </AppText>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontWeight: '600' },
  input: {
    minHeight: 50,
    // A constant width, so focusing a field changes its colour and not its size.
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    // 16px keeps iOS Safari from zooming the page when the field is focused.
    fontSize: 16,
  },
  multiline: { minHeight: 104, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
});
