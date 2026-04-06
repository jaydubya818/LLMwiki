declare module "pdf-parse" {
  function pdfParse(data: Buffer): Promise<{ text: string }>;
  export default pdfParse;
}
