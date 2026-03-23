import type { KeyBinding } from "@codemirror/view";

export function createSqlEditorKeybindings(args: {
  runSql: () => void;
}): readonly KeyBinding[] {
  const { runSql } = args;

  return [
    {
      key: "Mod-Enter",
      run: () => {
        runSql();
        return true;
      },
    },
  ];
}
