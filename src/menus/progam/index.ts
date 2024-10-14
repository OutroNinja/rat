import { programInitMenu } from "./init.js";
import { programMainMenu } from "./main.js";
import { programSettingsMenu } from "./settings.js";

export const programMenus = {
    main: programMainMenu,
    init: programInitMenu,
    settings: programSettingsMenu
}