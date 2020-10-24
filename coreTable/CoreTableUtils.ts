import { findIndex, slugifySameCase } from "grapher/utils/Util"
import {
    CoreColumnStore,
    ColumnTypeNames,
    CoreColumnDef,
    CoreRow,
    ColumnSlug,
} from "./CoreTableConstants"
import { InvalidCell, InvalidCellTypes } from "./InvalidCells"
import {
    OwidEntityCodeColumnDef,
    OwidEntityIdColumnDef,
    OwidEntityNameColumnDef,
    OwidTableSlugs,
} from "./OwidTableConstants"

export const columnStoreToRows = (columnStore: CoreColumnStore) => {
    const firstCol = Object.values(columnStore)[0]
    if (!firstCol) return []
    const slugs = Object.keys(columnStore)
    return firstCol.map((val, index) => {
        const newRow: any = {}
        slugs.forEach((slug) => {
            newRow[slug] = columnStore[slug][index]
        })
        return newRow
    })
}

// Picks a type for each column from the first row then autotypes all rows after that so all values in
// a column will have the same type. Only chooses between strings and numbers.
export const makeAutoTypeFn = () => {
    const slugToType: any = {}
    return (object: any) => {
        for (const columnSlug in object) {
            const value = object[columnSlug]
            const type = slugToType[columnSlug]
            if (type === "string") {
                object[columnSlug] = value
                continue
            }

            const number = parseFloat(value) // The "+" type casting that d3 does for perf converts "" to 0, so use parseFloat.
            if (type === "number") {
                object[columnSlug] = !isNaN(number)
                    ? number
                    : InvalidCellTypes.NaNButShouldBeNumber
                continue
            }

            if (!isNaN(number)) {
                object[columnSlug] = number
                slugToType[columnSlug] = "number"
                continue
            }

            object[columnSlug] = value
            slugToType[columnSlug] = "string"
        }
        return object
    }
}

// Removes whitespace and non-word characters from column slugs if any exist.
// The original names are moved to the name property on the column def.
export const standardizeSlugs = (rows: CoreRow[]) => {
    const colsToRename = Object.keys(rows[0])
        .map((name) => {
            return {
                name,
                slug: slugifySameCase(name),
            }
        })
        .filter((col) => col.name !== col.slug)
    if (!colsToRename.length) return undefined

    rows.forEach((row: CoreRow) => {
        colsToRename.forEach((col) => {
            row[col.slug] = row[col.name]
            delete row[col.name]
        })
    })

    return { rows, defs: colsToRename }
}

export const guessColumnDefFromSlugAndRow = (
    slug: string,
    sampleValue: any
): CoreColumnDef => {
    const valueType = typeof sampleValue

    if (slug === "day")
        return {
            slug: "day",
            type: ColumnTypeNames.Date,
            name: "Date",
        }

    if (slug === "year")
        return {
            slug: "year",
            type: ColumnTypeNames.Year,
            name: "Year",
        }

    if (slug === OwidTableSlugs.entityName) return OwidEntityNameColumnDef
    if (slug === OwidTableSlugs.entityCode) return OwidEntityCodeColumnDef
    if (slug === OwidTableSlugs.entityId) return OwidEntityIdColumnDef

    if (valueType === "number")
        return {
            slug,
            type: ColumnTypeNames.Numeric,
        }

    if (valueType === "string") {
        if (sampleValue.match(/^\d+$/))
            return {
                slug,
                type: ColumnTypeNames.Numeric,
            }
    }

    return { slug, type: ColumnTypeNames.String }
}

export const makeRowFromColumnStore = (
    rowIndex: number,
    columnStore: CoreColumnStore
) => {
    const row: any = {}
    const columns = Object.values(columnStore)
    Object.keys(columnStore).forEach((slug, colIndex) => {
        row[slug] = columns[colIndex][rowIndex]
    })
    return row
}

function isNotInvalidOrEmptyCell(value: any) {
    return value !== undefined && !(value instanceof InvalidCell)
}

export function interpolateRowValuesWithTolerance<
    ValueSlug extends ColumnSlug,
    TimeSlug extends ColumnSlug,
    Row extends { [key in TimeSlug]?: number } & { [key in ValueSlug]?: any }
>(
    rowsSortedByTimeAsc: Row[],
    valueSlug: ValueSlug,
    timeSlug: TimeSlug,
    timeTolerance: number
): Row[] {
    if (!rowsSortedByTimeAsc.length) return rowsSortedByTimeAsc

    let prevNonBlankIndex: number | undefined = undefined
    let nextNonBlankIndex: number | undefined = undefined

    for (let index = 0; index < rowsSortedByTimeAsc.length; index++) {
        const currentValue = rowsSortedByTimeAsc[index][valueSlug]
        if (isNotInvalidOrEmptyCell(currentValue)) {
            prevNonBlankIndex = index
            continue
        }

        if (
            nextNonBlankIndex !== -1 &&
            (nextNonBlankIndex === undefined || nextNonBlankIndex <= index)
        ) {
            nextNonBlankIndex = findIndex(
                rowsSortedByTimeAsc,
                (row) => isNotInvalidOrEmptyCell(row[valueSlug]),
                index + 1
            )
        }

        const timeOfCurrent: number = rowsSortedByTimeAsc[index][timeSlug]
        const timeOfPrevIndex: number =
            prevNonBlankIndex !== undefined
                ? rowsSortedByTimeAsc[prevNonBlankIndex][timeSlug]
                : -Infinity
        const timeOfNextIndex: number =
            nextNonBlankIndex !== undefined && nextNonBlankIndex !== -1
                ? rowsSortedByTimeAsc[nextNonBlankIndex][timeSlug]
                : Infinity

        const prevTimeDiff = Math.abs(timeOfPrevIndex - timeOfCurrent)
        const nextTimeDiff = Math.abs(timeOfNextIndex - timeOfCurrent)

        if (
            nextNonBlankIndex !== -1 &&
            nextTimeDiff <= prevTimeDiff &&
            nextTimeDiff <= timeTolerance
        ) {
            rowsSortedByTimeAsc[index] = {
                ...rowsSortedByTimeAsc[index],
                [valueSlug]: rowsSortedByTimeAsc[nextNonBlankIndex!][valueSlug],
                [timeSlug]: rowsSortedByTimeAsc[nextNonBlankIndex!][timeSlug],
            }
        } else if (prevTimeDiff <= timeTolerance) {
            rowsSortedByTimeAsc[index] = {
                ...rowsSortedByTimeAsc[index],
                [valueSlug]: rowsSortedByTimeAsc[prevNonBlankIndex!][valueSlug],
                [timeSlug]: rowsSortedByTimeAsc[prevNonBlankIndex!][timeSlug],
            }
        } else {
            rowsSortedByTimeAsc[index] = {
                ...rowsSortedByTimeAsc[index],
                [valueSlug]: InvalidCellTypes.NoValueWithinTolerance,
            }
        }
    }

    return rowsSortedByTimeAsc
}

// A dumb function for making a function that makes a key for a row given certain columns.
export const makeKeyFn = (columnSlugs: ColumnSlug[]) => (row: CoreRow) =>
    columnSlugs.map((slug) => row[slug]).join(" ")

// Memoization for immutable getters. Run the function once for this instance and cache the result.
export const imemo = (
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<any>
) => {
    const originalFn = descriptor.get!
    descriptor.get = function (this: any) {
        const propName = `${propertyName}_memoized`
        if (this[propName] === undefined) {
            // Define the prop the long way so we don't enumerate over it
            Object.defineProperty(this, propName, {
                configurable: false,
                enumerable: false,
                writable: false,
                value: originalFn.apply(this),
            })
        }
        return this[propName]
    }
}
