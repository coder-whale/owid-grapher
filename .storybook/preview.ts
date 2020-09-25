import { addParameters } from "@storybook/client-api"
import { INITIAL_VIEWPORTS } from "@storybook/addon-viewport"
import "site/client/owid.scss"
import "grapher/core/grapher.scss"

addParameters({
    viewport: {
        viewports: INITIAL_VIEWPORTS,
    },
    options: {
        storySort: {
            method: "alphabetical",
        },
    },
})
