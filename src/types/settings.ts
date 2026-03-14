export type ForgeColorTheme = "purple" | "blue" | "green" | "amber";

export interface ForgeSettings {
  fontFamily: string;
  fontSize: number;
  cursorStyle: "block" | "underline" | "bar";
  scrollback: number;
  copyOnSelect: boolean;
  colorTheme: ForgeColorTheme;
}
