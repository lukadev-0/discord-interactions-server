const { default: Collection } = require("@discordjs/collection")
const SlashCommand = require("./SlashCommand")
const invalidTypeError = require("./utils/invalidTypeError")

/**
 * Stores and manages commands
 */
class CommandsStore {
    /**
     * @param {DiscordInteractionsServer} server
     * @param {string} [guild]
     */
    constructor(server, guild) {
        /**
         * The server this store belongs to
         * @type {DiscordInteractionsServer}
         */
        this.server = server

        /**
         * The id of the guild that this store belongs to, if there is any
         * @type {?string}
         */
        this.guild = guild || null

        /**
         * The commands queue, use {@link CommandsStore#addCommand} to add a command to this queue
         * @type {SlashCommand[]}
         */
        this.queue = []

        /**
         * The commands cache
         * @type {Collection<string,SlashCommand>}
         */
        this.cache = new Collection()
    }

    /**
     * Adds a command.
     * The command will be put into {@link CommandsStore#queue|the queue}
     * Use {@link CommandsStore#update} to update the remote commands
     * @param {Function|SlashCommand} command - SlashCommand Constructor or instance to add
     */
    addCommand(command) {
        if (typeof command === 'function') command = new command(this.server, this.guild)
        if (!command instanceof SlashCommand)
            throw new invalidTypeError('command', 'SlashCommand Constructor or instance')

        this.queue.push(command)

        return this
    }

    /**
     * Update the remote commands.
     * Will update remote commands, will also clear {@link CommandsStore#queue|the queue}
     * @returns {Promise}
     */
    update() {
        return this.fetch().then(commands => {
            const remoteCommandNames = commands.map(v => v.name)
            const queuedCommandNames = this.queue.map(v => v.name)
            const addedQueuedCommandNames = queuedCommandNames.filter(v => (
                !remoteCommandNames.includes(v)
            ))
            const removedQueuedCommandNames = remoteCommandNames.filter(v => (
                !queuedCommandNames.includes(v)
            ))

            return Promise.all([
                ...addedQueuedCommandNames.map(commandName => {
                    const command = this.queue.find(v => v.name === commandName)
                    this.queue = this.queue.filter(v => v.name !== commandName)
                    return this.apiPost(command)
                }),
                ...removedQueuedCommandNames.map(commandName => {
                    const command = this.cache.find(v => v.name === commandName)
                    this.cache = this.cache.delete(command.id)
                    return this.apiDelete(command.id)
                }),
                ...this.queue.map(command => {
                    const remote = commands.find(v => v.name === command.name)
                    command._remote = remote.toInfo()
                    command.id = remote.id

                    this.queue.filter(v => v !== command)
                    this.cache.set(command.id, command)

                    return command.update()
                })
            ])
        })
    }

    /**
     * Fetch the commands, and caches them
     * @returns {Promise<SlashCommand[]>}
     */
    fetch() {
        return this.apiGet().then(res => res.data.map(v => {
            if (this.cache.has(v.id)) {
                const command = this.cache.get(v.id)
                command._remote = v
                return command
            } else {
                const command = new SlashCommand(this.server, this.guild, v)
                command._remote = v
                this.cache.set(command.id, command)
                return command
            }
        }))
    }

    /**
     * GET Discord Commands Endpoint
     * @private
     * @returns {Promise}
     */
    apiGet() {
        const endpoint = this.guild
            ? `/applications/${this.server.applicationId}/guilds/${this.guild}/commands`
            : `/applications/${this.server.applicationId}/commands`

        return this.server.api.get(endpoint)
    }

    /**
     * POST Discord Commands Endpoint
     * @private
     * @param {SlashCommand} command - Command to POST
     * @returns {Promise}
     */
    apiPost(command) {
        const endpoint = this.guild
            ? `/applications/${this.server.applicationId}/guilds/${this.guild}/commands`
            : `/applications/${this.server.applicationId}/commands`

        return this.server.api.post(endpoint, command.toInfo())
    }

    /**
     * PATCH Discord Commands Endpoint
     * @private
     * @param {SlashCommand} command - Command to PATCH
     * @param {SlashCommandInfo} changes - The changes to the command
     * @returns {Promise}
     */
    apiPatch(id, changes) {

        const endpoint = this.guild
            ? `/applications/${this.server.applicationId}/guilds/${this.guild}/commands/${id}`
            : `/applications/${this.server.applicationId}/commands/${id}`

        return this.server.api.patch(endpoint, changes)
    }

    /**
     * DELETE Discord Commands Endpoint
     * @private
     * @param {SlashCommand} command - Command to DELETE
     * @returns {Promise}
     */
    apiDelete(id) {

        const endpoint = this.guild
            ? `/applications/${this.server.applicationId}/guilds/${this.guild}/commands/${id}`
            : `/applications/${this.server.applicationId}/commands/${id}`

        return this.server.api.delete(endpoint)
    }
}

module.exports = CommandsStore