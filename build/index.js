import clear from "clear";
import figlet from "figlet";
import chalk from "chalk";
import { menus } from "#menus";
clear();
console.log(chalk.hex("#0092f7")(figlet.textSync("RAT", { horizontalLayout: "full" })));
console.log(chalk.hex("#0092f7")("Sistema de Rateios Automizados"));
console.log();
menus.program.main();
