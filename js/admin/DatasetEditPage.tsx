import * as React from 'react'
import {observer} from 'mobx-react'
import { observable, computed, runInAction, autorun, action, IReactionDisposer } from 'mobx'
import * as _ from 'lodash'
import {Prompt, Redirect} from 'react-router-dom'
const timeago = require('timeago.js')()

import { VariableDisplaySettings } from '../charts/VariableData'

import Admin from './Admin'
import AdminLayout from './AdminLayout'
import Link from './Link'
import { BindString, Toggle, BindFloat, FieldsRow } from './Forms'
import ChartList, { ChartListItem } from './ChartList'
import ChartConfig from '../charts/ChartConfig'
import ChartFigureView from '../charts/ChartFigureView'
import TagBadge from './TagBadge'

class VariableEditable {
    @observable name: string = ""
    @observable unit: string = ""
    @observable shortUnit: string = ""
    @observable description: string = ""
    @observable display: VariableDisplaySettings = new VariableDisplaySettings()

    constructor(json: any) {
        for (const key in this) {
            if (key === "display")
                _.extend(this.display, json.display)
            else
                this[key] = json[key]
        }
    }
}

@observer
class VariableEditRow extends React.Component<{ variable: VariableEditListItem }> {
    context!: { admin: Admin }
    @observable.ref chart?: ChartConfig
    @observable newVariable!: VariableEditable

    componentWillMount() { this.componentWillReceiveProps() }
    componentWillReceiveProps() {
        this.newVariable = new VariableEditable(this.props.variable)
    }

    async save() {
        const {variable} = this.props
        const json = await this.context.admin.requestJSON(`/api/variables/${variable.id}`, { variable: this.newVariable }, "PUT")

        if (json.success) {
            runInAction(() => {
                Object.assign(this.props.variable, this.newVariable)
            })
        }
    }

    @computed get chartConfig() {
        return {
            yAxis: { min: 0 },
            map: { variableId: this.props.variable.id },
            tab: "map",
            hasMapTab: true,
            dimensions: [{
                property: 'y',
                variableId: this.props.variable.id,
                display: _.clone(this.newVariable.display)
            }]
        }
    }

    dispose!: IReactionDisposer
    componentDidMount() {
        this.chart = new ChartConfig(this.chartConfig as any)

        this.dispose = autorun(() => {
            if (this.chart && this.chartConfig) {
                this.chart.update(this.chartConfig)
            }
        })
    }

    componentDidUnmount() {
        this.dispose()
    }

    render() {
        const {variable} = this.props
        const {newVariable} = this
        const {admin} = this.context

        return <div className="VariableEditRow row">
            <div className="col">
                <form onSubmit={e => { e.preventDefault(); this.save() }}>
                    <section>
                        <BindString label="Name" field="name" store={newVariable} helpText="The full name of the variable e.g. Top marginal income tax rate (Piketty 2014)"/>
                        <BindString label="Display name" field="name" store={newVariable.display} helpText="How the variable should be named on charts"/>
                        <FieldsRow>
                            <BindString label="Unit of measurement" field="unit" store={newVariable.display}/>
                            <BindString label="Short (axis) unit" field="shortUnit" store={newVariable.display}/>
                        </FieldsRow>
                        <FieldsRow>
                            <BindFloat label="Number of decimal places" field="numDecimalPlaces" store={newVariable.display} helpText={`A negative number here will round integers`}/>
                            <BindFloat label="Unit conversion factor" field="conversionFactor" store={newVariable.display} helpText={`Multiply all values by this amount`}/>
                        </FieldsRow>
                        <BindString label="Description" field="description" store={newVariable} helpText="Any further useful information about this variable" textarea/>
                    </section>
                    <input type="submit" className="btn btn-success" value="Update variable"/>
                </form>
            </div>
            {this.chart && <div className="col">
                <ChartFigureView chart={this.chart}/>
                <Link className="btn btn-secondary pull-right" to={`/charts/create/${btoa(JSON.stringify(this.chart.json))}`}>Edit as new chart</Link>
            </div>}
        </div>
    }
}

interface SourceInfo {
    id: number
    name: string
    dataPublishedBy: string
    dataPublisherSource: string
    link: string
    retrievedDate: string
    additionalInfo: string
}

interface VariableEditListItem {
    id: number
    name: string
    unit: string
    shortUnit: string
    description: string
    display: VariableDisplaySettings
}

interface DatasetPageData {
    id: number
    name: string
    description: string
    namespace: string
    updatedAt: string
    isPrivate: boolean

    availableTags: { id: number, name: string, parentName: string }[]
    tags: { id: number, name: string }[]
    variables: VariableEditListItem[]
    charts: ChartListItem[]
    source: SourceInfo
}

class DatasetEditable {
    @observable name: string = ""
    @observable description: string = ""
    @observable isPrivate: boolean = false

    @observable source: SourceInfo = {
        id: -1,
        name: "",
        dataPublishedBy: "",
        dataPublisherSource: "",
        link: "",
        retrievedDate: "",
        additionalInfo: ""
    }

    @observable tags: { id: number, name: string }[] = []

    constructor(json: DatasetPageData) {
        for (const key in this) {
            if (key in json)
                this[key] = (json as any)[key]
        }
    }
}

@observer
class DatasetTagEditor extends React.Component<{ newDataset: DatasetEditable, availableTags: { id: number, name: string, parentName: string }[], isBulkImport: boolean }> {

    @action.bound addTag(tagId: number) {
        const tag = this.props.availableTags.find(t => t.id === tagId)
        if (tag && !this.props.newDataset.tags.find(existingTag => existingTag.id === tag.id)) {
            this.props.newDataset.tags.push({ id: tag.id, name: tag.name })
        }
    }

    @action.bound removeTag(tagId: number) {
        this.props.newDataset.tags = this.props.newDataset.tags.filter(t => t.id !== tagId)
    }

    render() {
        const {newDataset, availableTags, isBulkImport} = this.props
        const tagsByParent = _.groupBy(availableTags, c => c.parentName)

        return <div className="form-group">
            <label>Tags</label>
            <div>{newDataset.tags.map(tag => <TagBadge tag={tag} onRemove={() => this.removeTag(tag.id)}/>)}</div>
            <select className="form-control" onChange={e => this.addTag(parseInt(e.target.value))} value="" disabled={isBulkImport}>
                <option value="" disabled selected>Add tag</option>
                {_.map(tagsByParent, (tags, parentName) =>
                    <optgroup label={parentName}>
                        {tags.map(tag =>
                            <option value={tag.id}>{tag.name}</option>
                        )}
                    </optgroup>
                )}
            </select>
            {/*<small className="form-text text-muted">Currently used for internal organization</small>*/}
        </div>
    }
}

@observer
class DatasetEditor extends React.Component<{ dataset: DatasetPageData }> {
    @observable newDataset!: DatasetEditable
    @observable isDeleted: boolean = false

    // Store the original dataset to determine when it is modified
    componentWillMount() { this.componentWillReceiveProps() }
    componentWillReceiveProps() {
        this.newDataset = new DatasetEditable(this.props.dataset)
        this.isDeleted = false
    }

    @computed get isModified(): boolean {
        return JSON.stringify(this.newDataset) !== JSON.stringify(new DatasetEditable(this.props.dataset))
    }

    async save() {
        const {dataset} = this.props
        const json = await this.context.admin.requestJSON(`/api/datasets/${dataset.id}`, { dataset: this.newDataset }, "PUT")

        if (json.success) {
            runInAction(() => {
                Object.assign(this.props.dataset, this.newDataset)
            })
        }
    }

    async delete() {
        const {dataset} = this.props
        if (!window.confirm(`Really delete the dataset ${dataset.name}? This action cannot be undone!`))
            return

        const json = await this.context.admin.requestJSON(`/api/datasets/${dataset.id}`, {}, "DELETE")

        if (json.success) {
            this.isDeleted = true
        }
    }

    render() {
        if (this.isDeleted)
            return <Redirect to="/datasets"/>

        const {dataset} = this.props
        const {newDataset} = this
        const isBulkImport = dataset.namespace !== 'owid'

        return <main className="DatasetEditPage">
            <Prompt when={this.isModified} message="Are you sure you want to leave? Unsaved changes will be lost."/>
            <section>
                <h1>{dataset.name}</h1>
                <p>Last updated {timeago.format(dataset.updatedAt)}</p>
                <Link native to={`/datasets/${dataset.id}.csv`} className="btn btn-primary">
                    <i className="fa fa-download"/> Download CSV
                </Link>
                <Link native to={`/../grapher/admin/datasets/history/${dataset.id}`} className="btn btn-secondary">
                    <i className="fa fa-history"/> Version history
                </Link>
            </section>
            <section>
                <h3>Dataset metadata</h3>
                <form onSubmit={e => { e.preventDefault(); this.save() }}>
                    {isBulkImport ?
                        <p>This dataset came from an automated import, so we can't change the original metadata manually.</p>
                    : <p>The core metadata for the dataset. It's important to keep this in a standardized style across datasets.</p>}
                    <div className="row">
                        <div className="col">
                            <BindString field="name" store={newDataset} label="Name" disabled={isBulkImport} helpText="Short name for this dataset, followed by the source and year. Example: Government Revenue Data – ICTD (2016)"/>
                            <BindString field="description" store={newDataset} label="Description" textarea disabled={isBulkImport}/>
                            <BindString field="link" store={newDataset.source} label="Link" disabled={isBulkImport} helpText="Link to the publication from which we retrieved this data"/>
                            <BindString field="retrievedDate" store={newDataset.source} label="Retrieved" disabled={isBulkImport} helpText="Date when this data was obtained by us"/>
                            <DatasetTagEditor newDataset={newDataset} availableTags={dataset.availableTags} isBulkImport={isBulkImport}/>
                            <Toggle label="Is private (exclude from bulk exports)" value={newDataset.isPrivate} onValue={v => newDataset.isPrivate = v}/>
                        </div>

                        <div className="col">
                            <BindString field="name" store={newDataset.source} label="Source Name" disabled={isBulkImport} helpText={`Source name displayed on charts using this dataset. For academic papers, the name of the source should be "Authors (year)" e.g. Arroyo-Abad and Lindert (2016). For institutional projects or reports, the name should be "Institution, Project (year or vintage)" e.g. U.S. Bureau of Labor Statistics, Consumer Expenditure Survey (2015 release). For data that we have modified extensively, the name should be "Our World in Data based on Author (year)" e.g. Our World in Data based on Atkinson (2002) and Sen (2000).`}/>

                            <BindString field="dataPublishedBy" store={newDataset.source} label="Data published by" disabled={isBulkImport} helpText={`For academic papers this should be a complete reference. For institutional projects, detail the project or report. For data we have modified extensively, list OWID as the publishers and provide the name of the person in charge of the calculation.`}/>
                            <BindString field="dataPublisherSource" store={newDataset.source} label="Data publisher's source" disabled={isBulkImport} helpText={`Basic indication of how the publisher collected this data e.g. surveys data. Anything longer than a line should be relegated to the field "Additional information".`}/>
                            <BindString field="additionalInfo" store={newDataset.source} label="Additional information" textarea disabled={isBulkImport}/>
                        </div>
                    </div>
                    {!isBulkImport && <input type="submit" className="btn btn-success" value="Update dataset"/>}
                </form>
            </section>
            <section>
                <h3>Variables</h3>
                {dataset.variables.map(variable =>
                    <VariableEditRow variable={variable}/>
                )}
            </section>
            {/*<section>
                <h3>Sources</h3>
                <table className="table table-bordered">
                    <thead>
                        <tr>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dataset.sources.map(source => <tr>
                            <td><Link to={`/sources/${source.id}`}>{source.name}</Link></td>
                        </tr>)}
                    </tbody>
                </table>
            </section>*/}
            <section>
                <h3>Charts</h3>
                <ChartList charts={dataset.charts}/>
            </section>
            {!isBulkImport && <section>
                <h3>Danger zone</h3>
                <p>
                    Delete this dataset and all variables it contains. If there are any charts using this data, you must delete them individually first.
                </p>
                <div className="card-footer">
                    <button className="btn btn-danger" onClick={() => this.delete()}>Delete dataset</button>
                </div>
            </section>}
        </main>
    }
}

@observer
export default class DatasetEditPage extends React.Component<{ datasetId: number }> {
    context!: { admin: Admin }
    @observable dataset?: DatasetPageData

    render() {
        return <AdminLayout title={this.dataset && this.dataset.name}>
            {this.dataset && <DatasetEditor dataset={this.dataset}/>}
        </AdminLayout>
    }

    async getData() {
        const json = await this.context.admin.getJSON(`/api/datasets/${this.props.datasetId}.json`)
        runInAction(() => {
            this.dataset = json.dataset as DatasetPageData
        })
    }

    componentDidMount() { this.componentWillReceiveProps() }
    componentWillReceiveProps() {
        this.getData()
    }
}
