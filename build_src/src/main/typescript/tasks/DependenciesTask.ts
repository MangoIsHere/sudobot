import AbstractTask from "blazebuild/tasks/AbstractTask";
import { Task } from "blazebuild/tasks/Task";
import { TaskAction } from "blazebuild/tasks/TaskAction";
import { TaskOutputGenerator } from "blazebuild/tasks/TaskOutputGenerator";
import { $ } from "bun";

@Task({
    description: "Installs the dependencies",
    group: "Build"
})
class DependenciesTask extends AbstractTask {
    @TaskAction
    protected override async run(): Promise<void> {
        await $`bun install`;
    }

    @TaskOutputGenerator
    protected override generateOutput(): string[] {
        return ["node_modules"];
    }
}

export default DependenciesTask;
