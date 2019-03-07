import gulp from "gulp";
import minimist from "minimist";
import * as buildTools from "turbo-gulp";
import { LibTarget, registerLibTasks } from "turbo-gulp/targets/lib";
import { MochaTarget, registerMochaTasks } from "turbo-gulp/targets/mocha";
import { NodeTarget, registerNodeTasks } from "turbo-gulp/targets/node";

interface Options {
  devDist?: string;
}

const options: Options & minimist.ParsedArgs = minimist(process.argv.slice(2), {
  string: ["devDist"],
  default: {devDist: undefined},
  alias: {devDist: "dev-dist"},
});

const project: buildTools.Project = {
  root: __dirname,
  packageJson: "package.json",
  buildDir: "build",
  distDir: "dist",
  srcDir: "src",
  tslint: {
    configuration: {
      rules: {
        "max-file-line-count": false,
        "no-submodule-imports": false,
      },
    },
  },
};

const lib: LibTarget = {
  project,
  name: "lib",
  srcDir: "src/lib",
  scripts: ["**/*.ts"],
  mainModule: "index",
  dist: {
    packageJsonMap: (old: buildTools.PackageJson): buildTools.PackageJson => {
      const version: string = options.devDist !== undefined ? `${old.version}-build.${options.devDist}` : old.version;
      return <any> {...old, version, scripts: undefined, private: false};
    },
    npmPublish: {
      tag: options.devDist !== undefined ? "next" : "latest",
    },
  },
  customTypingsDir: "src/custom-typings",
  tscOptions: {
    declaration: true,
    skipLibCheck: true,
  },
  typedoc: {
    dir: "typedoc",
    name: "SWF Tree",
    deploy: {
      repository: "git@github.com:open-flash/swf-tree.git",
      branch: "gh-pages",
    },
  },
  clean: {
    dirs: ["build/lib", "dist/lib"],
  },
};

const test: MochaTarget = {
  project,
  name: "test",
  srcDir: "src",
  scripts: ["test/**/*.ts", "lib/**/*.ts"],
  customTypingsDir: "src/custom-typings",
  tscOptions: {
    skipLibCheck: true,
  },
  copy: [
    {
      files: ["**/*.{aasm1,avm1,json,swf}"],
    },
  ],
  clean: {
    dirs: ["build/test"],
  },
};

const main: NodeTarget = {
  project,
  name: "main",
  srcDir: "src",
  scripts: ["main/**/*.ts", "lib/**/*.ts"],
  tsconfigJson: "src/main/tsconfig.json",
  mainModule: "main/main",
  customTypingsDir: "src/custom-typings",
  tscOptions: {
    skipLibCheck: true,
  },
  clean: {
    dirs: ["build/main", "dist/main"],
  },
};

const libTasks: any = registerLibTasks(gulp, lib);
registerMochaTasks(gulp, test);
registerNodeTasks(gulp, main);
buildTools.projectTasks.registerAll(gulp, project);

gulp.task("all:tsconfig.json", gulp.parallel("lib:tsconfig.json", "main:tsconfig.json", "test:tsconfig.json"));
gulp.task("dist", libTasks.dist);
gulp.task("default", libTasks.dist);
