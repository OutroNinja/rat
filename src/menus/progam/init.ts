import { filer } from "#lib";
import { select, spinner as createSpinner, note, outro, confirm } from "@clack/prompts";
import * as XLSX from "xlsx";
import { Readable } from "stream";
import * as cpexcel from "xlsx/dist/cpexcel.full.mjs";
import * as fs from "fs";
import { homedir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import strSimilarity from "string-similarity";
import ck from "chalk";

export async function programInitMenu() {
  const appDataDir = path.join(homedir(), ".rat");
  const hcFilePath = path.join(appDataDir, "selected_hc.xlsx");

  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }

  if (!fs.existsSync(hcFilePath)) {
    const hcUploadedFilePath: string | null = await filer.createFolderAndWaitUpload({
      filePattern: /.+\.xlsx$/,
      message: ck.yellow("Adicione a planilha de HC na pasta aberta"),
    });

    if (!hcUploadedFilePath) return;
    const file = fs.readFileSync(hcUploadedFilePath);
    fs.writeFileSync(hcFilePath, file);
  }

  XLSX.set_fs(fs);
  XLSX.stream.set_readable(Readable);
  XLSX.set_cptable(cpexcel);

  const rateioType = await select({
    message: ck.bold("🌟 Selecione o tipo de rateio:"),
    options: [
      { label: "✈️  Rateio Voll", value: "voll" },
      { label: "🚗 Rateio Uber", value: "uber" },
    ],
  });

  switch (rateioType) {
    case "voll":
      const vollSheetUploaded: string | null = await filer.createFolderAndWaitUpload({
        filePattern: /.+\.xlsx$/,
        message: ck.yellow("Adicione a planilha de rateio Voll na pasta aberta"),
      });

      if (!vollSheetUploaded) return;

      const spinner = createSpinner();
      spinner.start("🔄 Processando planilha...");

      try {
        const vollWorkbook = XLSX.readFile(vollSheetUploaded);
        const vollData: (string | number)[][] = XLSX.utils.sheet_to_json(vollWorkbook.Sheets[vollWorkbook.SheetNames[0]], { header: 1 });

        const hcWorkbook = XLSX.readFile(hcFilePath);
        const hcData: (string | number)[][] = XLSX.utils.sheet_to_json(hcWorkbook.Sheets[hcWorkbook.SheetNames[0]], { header: 1 });

        // Avoid bug when saving the file
        const originalSheet = vollWorkbook.Sheets[vollWorkbook.SheetNames[0]];
        vollWorkbook.SheetNames[0] = "Planilha Voll";
        vollWorkbook.Sheets["Planilha Voll"] = originalSheet;

        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        let templatePath: string;
        if (process.env.NODE_ENV === "production") {
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          templatePath = path.join(__dirname, "../../src/assets/template.xlsx");
        } else {
          templatePath = path.join(__dirname, "../../../src/assets/template.xlsx");
        }
        const templateWorkbook = XLSX.readFile(templatePath);

        XLSX.utils.book_append_sheet(vollWorkbook, templateWorkbook.Sheets[templateWorkbook.SheetNames[0]], "SAP");

        const warnings: Array<{ type: string; message: string }> = [];
        const ccData: Array<{
          cc: string | number;
          tax: number;
          commission: number;
          service: string;
          type: string;
        }> = [];

        vollData[0].push("Comissão");

        for (const [rowIndex, row] of vollData.entries()) {
          const cc = row[11];
          const tax = row[18];
          const total = row[24];
          const passengerName = row[15] as string;
          const service = row[10] as string;

          if (cc && passengerName) {
            const taxValue = typeof tax === "number" ? tax : parseFloat(tax as string);
            const totalValue = typeof total === "number" ? total : parseFloat(total as string);

            if (!isNaN(taxValue) && !isNaN(totalValue)) {
              let found = false;

              for (const hcRow of hcData) {
                const hcName = hcRow[3] as string;
                const hcCC = hcRow[8] as string;
                const hcType = hcRow[21] as string;

                if (typeof passengerName === "string" && typeof hcName === "string") {
                  const similarity = strSimilarity.compareTwoStrings(passengerName, hcName);
                  if (similarity > 0.6) {
                    if (cc === hcCC) {
                      found = true;

                      const commission = parseFloat((totalValue - taxValue).toFixed(2));

                      let serviceKey = service;
                      if (["AÉREO", "RODOVIÁRIO", "CARRO"].includes(service)) {
                        serviceKey = "AÉREO/RODOVIÁRIO/CARRO";
                      }

                      ccData.push({
                        cc,
                        tax: taxValue,
                        commission,
                        service: serviceKey,
                        type: hcType,
                      });

                      vollData[rowIndex][26] = commission;
                      break;
                    } else {
                      warnings.push({
                        type: "ccMismatch",
                        message: ck.red(`❌ CC ${cc} não corresponde ao CC ${hcCC} do passageiro ${passengerName}`)
                      });
                    }
                  }
                }
              }

              if (!found) {
                warnings.push({
                  type: "notFound",
                  message: ck.red(`❌ Passageiro ${passengerName} não encontrado na planilha de HC, usando CC ${cc} existente`)
                });

                const commission = parseFloat((totalValue - taxValue).toFixed(2));
                let serviceKey = service;
                if (["AÉREO", "RODOVIÁRIO", "CARRO"].includes(service)) {
                  serviceKey = "AÉREO/RODOVIÁRIO/CARRO";
                }

                ccData.push({
                  cc,
                  tax: taxValue,
                  commission,
                  service: serviceKey,
                  type: "Despesa",
                });

                vollData[rowIndex][26] = commission;
              }
            }
          }
        }

        const sapData: (string | number)[][] = [];
        for (const entry of ccData) {
          const { cc, tax, commission, type, service } = entry;

          let svCodeTax: string = "";
          let svCodeCommission: string = "";
          let typeDescription: string = "";

          if (type === "Despesa") {
            if (service === "AÉREO/RODOVIÁRIO/CARRO") {
              svCodeTax = tax > 0 ? `SV.190` : "";
              svCodeCommission = commission > 0 ? `SV.189` : "";
            } else if (service === "HOTEL") {
              svCodeTax = tax > 0 ? `SV.196` : "";
              svCodeCommission = commission > 0 ? `SV.195` : "";
            }
            typeDescription = "Compra Despesa";
          } else if (type === "Custo") {
            if (service === "AÉREO/RODOVIÁRIO/CARRO") {
              svCodeTax = tax > 0 ? `SV.194` : "";
              svCodeCommission = commission > 0 ? `SV.193` : "";
            } else if (service === "HOTEL") {
              svCodeTax = tax > 0 ? `SV.192` : "";
              svCodeCommission = commission > 0 ? `SV.191` : "";
            }
            typeDescription = "Compra Custo";
          }

          if (svCodeTax) {
            sapData.push([svCodeTax, "", "1", tax, "0", typeDescription, "Não", "1933-005", "1,933", "", "", "", "", "Manual", "", "0", cc, "", "SYMPLA INTERNET SOLUCOES S/A", "96", "", "", "", "", "0", "0", "", "", "", "", "0"]);
            sapData[sapData.length - 1][16] = cc;
          }

          if (svCodeCommission) {
            sapData.push([svCodeCommission, "", "1", commission, "0", typeDescription, "Não", "1933-005", "1,933", "", "", "", "", "Manual", "", "0", cc, "", "SYMPLA INTERNET SOLUCOES S/A", "96", "", "", "", "", "0", "0", "", "", "", "", "0"]);
            sapData[sapData.length - 1][16] = cc;
          }
        }

        spinner.stop("✅ Planilha processada com sucesso!");

        if (warnings.length > 0) {
          const groupedWarnings = warnings.reduce((acc, warning) => {
            if (!acc[warning.type]) {
              acc[warning.type] = [];
            }
            acc[warning.type].push(warning.message);
            return acc;
          }, {} as Record<string, string[]>);

          for (const [type, messages] of Object.entries(groupedWarnings)) {
            note(messages.join("\n"), ck.yellow(`⚠️  Avisos (${type})`));
          }
        }

        const autoFixOptions = await confirm({
          message: "🛠️  Deseja alterar os centros de custos divergentes levando a planilha HC como prioridadde?",
          initialValue: true,
        });

        if (autoFixOptions) {
          for (const warning of warnings) {
            if (warning.type === "ccMismatch" || warning.type === "notFound") {
              const passengerName = warning.message.match(/passageiro (.+?) não/)?.[1];
              if (passengerName) {
                for (const hcRow of hcData) {
                  const hcName = hcRow[3] as string;
                  const hcCC = hcRow[8] as string;
                  const similarity = strSimilarity.compareTwoStrings(passengerName, hcName);
                  if (similarity > 0.6) {
                    for (const [rowIndex, row] of vollData.entries()) {
                      if (row[15] === passengerName) {
                        row[11] = hcCC;
                        vollData[rowIndex][26] = parseFloat((parseFloat(row[24] as string) - parseFloat(row[18] as string)).toFixed(2));
                      }
                    }
                  }
                }
              }
            }
          }
          outro(ck.green("✅ Correções aplicadas com sucesso"));
        } else {
          outro(ck.gray("⚪ Correções não aplicadas"));
          for (const warning of warnings) {
            if (warning.type === "ccMismatch" || warning.type === "notFound") {
              const passengerName = warning.message.match(/passageiro (.+?) não/)?.[1];
              if (passengerName) {
                for (const [rowIndex, row] of vollData.entries()) {
                  if (row[15] === passengerName) {
                    const cc = row[11];
                    row[11] = cc;
                    vollData[rowIndex][26] = parseFloat((parseFloat(row[24] as string) - parseFloat(row[18] as string)).toFixed(2));
                  }
                }
              }
            }
          }
          outro(ck.green("✅ Correções ignoradas com sucesso"));
        }

        const sapSheet = vollWorkbook.Sheets["SAP"];
        const now = new Date();
        const day = String(now.getDate()).padStart(2, "0");
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const year = now.getFullYear();
        const timestamp = now.getTime();

        const fileName = `rateio_${rateioType}_${day}_${month}_${year}_${timestamp}.xlsx`;
        const downloadsPath = path.join(homedir(), "Downloads", fileName);

        XLSX.utils.sheet_add_aoa(sapSheet, sapData, { origin: "A2" });
        XLSX.writeFile(vollWorkbook, downloadsPath);
        outro(`📦 Planilha pronta para download ${ck.green(downloadsPath)}`);
      } catch (err) {
        spinner.stop("❌ Erro ao processar planilha");
        console.error(err);
      }
      break;
    case "uber":
      // TODO: Logic for Uber rateio
      break;
    default:
      outro(ck.red("❌ Tipo de rateio não reconhecido."));
      break;
  }
}