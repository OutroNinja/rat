import { filer } from "#lib";
import { utils } from "#lib";
import { menus } from "#menus";
import { spinner as createSpinner, outro, select } from "@clack/prompts";
import { renameSync } from "fs";
import { homedir } from "os";
import path from "path";
const appDataDir = path.join(homedir(), ".rat");
export async function programSettingsMenu() {
    const hcFiles = filer.listHCFiles();
    let currentHCFile = hcFiles[0];
    if (hcFiles.length > 0) {
        const currentTimestamp = currentHCFile.match(/\((\d+)\)/)?.[1];
        const currentHCDate = utils.formatDate(Number(currentTimestamp));
        outro(`✅ Planilha HC Atual: ${currentHCFile} (Data: ${currentHCDate})`);
        const selectedOption = await select({
            message: "Configurações do RAT",
            options: [
                { label: "📂 Enviar nova planilha HC", value: "upload" },
                { label: "📄 Ver planilhas anteriores", value: "viewPrevious" }
            ]
        });
        switch (selectedOption) {
            case "upload":
                const file = await filer.createFolderAndWaitUpload({
                    filePattern: /.+\.xlsx$/,
                    message: "Selecione a nova planilha HC",
                });
                if (file) {
                    const spinner = createSpinner();
                    spinner.start("Salvando planilha HC");
                    await filer.saveHCFile(file);
                    spinner.stop("Planilha HC salva com sucesso!");
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                break;
            case "viewPrevious":
                const previousHCFiles = hcFiles.slice(1);
                const options = previousHCFiles.map(file => {
                    const timestampMatch = file.match(/\((\d+)\)/);
                    if (!timestampMatch)
                        return null;
                    const timestamp = Number(timestampMatch[1]);
                    const formattedDate = utils.formatDate(timestamp);
                    return { label: `Planilha HC - ${formattedDate}`, value: file };
                }).filter(option => option !== null);
                if (!options || options.length < 1) {
                    outro("Nenhuma planilha HC anterior encontrada.");
                    return;
                }
                const selectedPreviousFile = await select({
                    message: "Selecione a planilha HC",
                    options
                });
                if (selectedPreviousFile) {
                    const newTimestamp = Date.now();
                    const oldHCFilePath = path.join(appDataDir, selectedPreviousFile);
                    const newHCFilePath = path.join(appDataDir, `planilha_hc_${newTimestamp}.xlsx`);
                    renameSync(oldHCFilePath, newHCFilePath);
                    outro(`Planilha HC alterada com sucesso!`);
                    currentHCFile = `planilha_hc_${newTimestamp}.xlsx`;
                }
                else {
                    outro("Nenhuma planilha HC anterior encontrada.");
                }
                break;
        }
    }
    else {
        const file = await filer.createFolderAndWaitUpload({
            filePattern: /.+\.xlsx$/,
            message: "Nenhuma planilha HC encontrada. Por favor, faça o upload de uma nova planilha HC",
        });
        if (file) {
            const spinner = createSpinner();
            spinner.start("Salvando nova planilha HC...");
            await filer.saveHCFile(file);
            spinner.stop("Planilha HC salva com sucesso!");
            await new Promise(resolve => setTimeout(resolve, 1000));
            menus.program.main();
        }
    }
}
