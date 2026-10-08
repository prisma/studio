export const PREVIEW_COMMENT_MARKER = "<!-- studio-compute-preview -->";

export function buildPreviewCommentBody(args) {
  const { branchName, serviceName, serviceUrl } = args;

  const lines = [
    PREVIEW_COMMENT_MARKER,
    "Compute preview deployed with Prisma Composer.",
    "",
    `Stage: \`${branchName}\``,
    `Service: \`${serviceName}\``,
    `Preview: ${serviceUrl}`,
  ];

  return lines.join("\n");
}
