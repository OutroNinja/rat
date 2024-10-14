import { spinner } from "@clack/prompts";
import * as fs from "fs";
import tmp from "tmp";
import { log } from "#lib";
import { exec } from "child_process";
import * as XLSX from "xlsx";
import { homedir } from "os";
import path from "path";
const appDataDir = path.join(homedir(), ".rat");
export const filer = {
    async createFolderAndWaitUpload(options) {
        const { filePattern, timeout = 30000, message = "Aguardando upload" } = options;
        const tempDir = tmp.dirSync({ unsafeCleanup: true }).name;
        const loadingSpinner = spinner();
        loadingSpinner.start(message);
        this.openFolder(tempDir);
        let fileUploaded = null;
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const files = await fs.promises.readdir(tempDir);
            const uploadedFile = files.find(file => filePattern.test(file));
            if (uploadedFile) {
                if (filePattern.test(uploadedFile)) {
                    fileUploaded = `${tempDir}/${uploadedFile}`;
                    loadingSpinner.stop("Upload concluído!");
                    return fileUploaded;
                }
                else {
                    await fs.promises.unlink(`${tempDir}/${uploadedFile}`);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        loadingSpinner.stop("Tempo de espera excedido!");
        return null;
    },
    listHCFiles() {
        if (!fs.existsSync(appDataDir)) {
            fs.mkdirSync(appDataDir, { recursive: true });
        }
        return fs.readdirSync(appDataDir)
            .filter(file => file.startsWith("planilha_hc"))
            .sort((a, b) => Number(b.match(/\((\d+)\)/)?.[1]) - Number(a.match(/\((\d+)\)/)?.[1]));
    },
    async saveHCFile(filePath) {
        const timestamp = Date.now();
        const destinationPath = path.join(appDataDir, `planilha_hc_${timestamp}.xlsx`);
        fs.copyFileSync(filePath, destinationPath);
        const hcFiles = this.listHCFiles();
        if (hcFiles.length > 3) {
            const filesToDelete = hcFiles.slice(3);
            for (const file of filesToDelete) {
                fs.unlinkSync(path.join(appDataDir, file));
            }
        }
    },
    openFolder(folderPath, debug) {
        const platform = process.platform;
        let command;
        switch (platform) {
            case "win32":
                command = `start "" "${folderPath}"`;
                break;
            case "darwin":
                command = `open ${folderPath}`;
                break;
            case "linux":
                command = `xdg-open ${folderPath}`;
                break;
            default:
                log.error("Plataforma não suportada");
                return;
        }
        exec(command, (err) => {
            if (!debug)
                return;
            if (err) {
                log.debug(`Erro ao abrir diretório ${folderPath}: ${err.message}`);
            }
            else {
                log.debug(`\nDiretório ${folderPath} aberto com sucesso!`);
            }
        });
    },
    exRead(options) {
        const { filePath, sheetName } = options;
        const fileBuffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        return data;
    },
    async exValidatePattern(options, patternFilePath) {
        try {
            const { filePath, sheetName } = options;
            // Read Excel data
            const excelData = this.exRead({ filePath, sheetName });
            // Read pattern file asynchronously
            const patternData = JSON.parse(await fs.promises.readFile(patternFilePath, "utf-8"));
            // Extract headers from Excel data
            const excelHeaders = Object.keys(excelData[0]);
            // Check for missing and extra headers
            const missingHeaders = patternData.filter((header) => !excelHeaders.includes(header));
            const extraHeaders = excelHeaders.filter((header) => !patternData.includes(header));
            if (missingHeaders.length === 0 && extraHeaders.length === 0) {
                return { status: "success", message: "Padrão válido, todos os cabeçalhos estão corretos." };
            }
            else {
                const message = `
                    Cabeçalhos faltantes: ${missingHeaders.length > 0 ? missingHeaders.join(", ") : "Nenhum"}
                    Cabeçalhos extras: ${extraHeaders.length > 0 ? extraHeaders.join(", ") : "Nenhum"}
                `;
                return { status: "fail", message };
            }
        }
        catch (err) {
            return { status: "error", message: `Erro ao validar o padrão: ${err}` };
        }
    }
};
