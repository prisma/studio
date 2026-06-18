export function WorkflowJsonInspector(props: {
  label: string;
  value: unknown;
}) {
  const { label, value } = props;

  return (
    <details className="rounded-md border border-border bg-muted/20">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-border p-3 text-xs leading-5 text-foreground">
        {formatJson(value)}
      </pre>
    </details>
  );
}

function formatJson(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
