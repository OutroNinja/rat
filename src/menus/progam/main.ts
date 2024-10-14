import { hCancel, messages } from "#lib";
import { menus } from "#menus";
import { outro, select } from "@clack/prompts";
import ck from "chalk";

export async function programMainMenu() {
    const selected = await select({
        message: ck.bold(`Selecione uma opção`),
        options: [
            { label: ck.green("◈ Iniciar Sistema"), value: "init-system" },
            { label: ck.blue("☰ Configurações"), value: "settings" },
            { label: ck.red("✕ Sair"), value: "quit" }
        ]
    }) as string;

    hCancel(selected);

    switch (selected) {
        case "init-system":
            menus.program.init();
            return;
        case "settings": 
            menus.program.settings();
            return;
        case "quit":
            outro(messages.bye);
            process.exit(0);
    }
}