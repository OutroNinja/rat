import chalk from "chalk";
import { isCancel, outro } from "@clack/prompts";

export const messages = {
    bye: `👋 Até mais! ${chalk.hex("#0092f7")("Made for Sympla")}`
}

export function hCancel<T>(value: T | symbol, message?: string): asserts value is T {
    if (isCancel(value)) {
        outro(message ?? messages.bye);
        process.exit(0)
    }
}