import { existsSync } from "fs";
import { rm } from "fs/promises";
import AbstractTask from "../../core/AbstractTask";
import BlazeBuild from "../../core/BlazeBuild";
import { Caching, CachingMode } from "../../decorators/Caching";
import { Dependencies } from "../../decorators/Dependencies";
import { Task } from "../../decorators/Task";

@Caching(CachingMode.None)
class CleanTask extends AbstractTask {
    public override readonly name = "clean";
    public override readonly defaultDescription: string = "Cleans the build directory";
    public override readonly defaultGroup: string = "Build";

    @Task({
        name: "cleanCaches",
        noPrefix: true,
        defaultDescription: "Cleans the cache files"
    })
    public async caches(): Promise<void> {
        const cacheFile = BlazeBuild.buildInfoDir("cache.json");

        if (existsSync(cacheFile)) {
            await this.blaze.cacheManager.rmFile();
            this.blaze.cacheManager.clear();
            this.blaze.packageManager.reset();
            this.blaze.packageManager.loadPackageJSON();
        }

        if (existsSync(BlazeBuild.buildInfoDir("files.json"))) {
            await rm(BlazeBuild.buildInfoDir("files.json"));
            this.blaze.fileSystemManager.removeAllCaches();
        }
    }

    @Dependencies("cleanCaches")
    public override async execute(): Promise<void> {
        if (existsSync(this.blaze.projectManager.buildDir)) {
            await rm(this.blaze.projectManager.buildDir, { recursive: true, force: true });
        }
    }
}

export default CleanTask;