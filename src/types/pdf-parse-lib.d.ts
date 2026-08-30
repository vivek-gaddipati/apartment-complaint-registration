declare module "pdf-parse/lib/pdf-parse.js" {
  export default function parsePdf(input: Buffer): Promise<{ text: string }>;
}
