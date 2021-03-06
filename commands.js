let path = require('path');
let repl = require("repl");
let replHistory = require('repl.history');
let fs = require('fs');
let cpr = require('cpr');
let child = require('child_process');
let pluralize = require('pluralize');
let { yellow, red, green, orange, grey, chalk, log } = require('./lib/log');
let lodash = require('lodash');
let readline = require('readline');

const { Promise } = require('bluebird');

rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function exists (question, callback) {
  rl.question(question, function(answer) {
    callback(answer);
  });
}

class Command {
  constructor (commands, args) {

    this.commands = commands;
    this.args = args;
    this.cliDir = __dirname;
    this.path = process.cwd();

    try {
      this.gladCliConfig = require(path.join(this.cliDir, 'package.json'));
      this.gladCliVersion = this.gladCliConfig.version;
      this.config = require(path.join(process.cwd(), 'config'));
      this.package = require(path.join(process.cwd(), 'package.json'));
      this.gladConfig = require(path.join(process.cwd(), 'node_modules/gd/package.json'));
      this.gladVersion = this.gladConfig.version;

    } catch (err) {
      this.package = this.package || false;
      this.config = this.config || false;
      this.gladCliConfig = this.gladCliConfig || false;
      this.gladConfig = this.gladConfig || false;
      this.gladCliVersion = this.gladCliVersion || false;
      this.gladVersion = this.gladVersion || false;
    }

    Promise.each(this.commands, cmd => this[cmd].call(this))
      .then(() => process.exit())
      .catch(err => log(err));
  }

  version () {
    yellow(`Glad Version: ${this.gladConfig && this.gladConfig.version}`);
    yellow(`Glad CLI Version: ${this.gladCliConfig && this.gladCliConfig.version}`);
    yellow(`${this.package && this.package.name || 'Your Project'}: ${this.package && this.package.version}`);
    return Promise.resolve();
  }

  help () {
    green("Available Commands:")
    yellow("glad api   [name]                   # Creates a new API");
    // yellow("glad stub  [path] --model [model]   # Creates a new API");
    yellow("glad serve [-i]                     # Starts the server, pass in i for interactive mode");
    yellow("glad run   [-i]                     # Runs a job or script in the same process as a new application server (without binding to a port). Pass in i for interactive mode");
    yellow("glad -v                             # Displays The Version of Glad");
    // yellow("glad list [m|r]                     # Displays All of the controllers, models, routes in your application. Run glad list for controllers");
    yellow("glad destroy [name]                 # Destroys an API, removes the model, route, controller, and test");
    // yellow("glad p --editor [bin]               # Sets your preferred editor, pass in the command that opens your editor from terminal");
    yellow("                                      examples include subl, wstorm, atom, etc...");

    green('\nALIASES:');
    yellow("glad a [name]          # glad api [name]");
    yellow("glad s [i]             # glad serve [i]");
    yellow("glad r [i]             # glad run [i]");
    // yellow("glad l [m|r]           # glad list [m|r]");
    yellow("glad d [name]          # glad destroy [name]");
    process.exit(0);
  }

  empty () {
    this.version();
    log('\n');
    this.help();
  }

  serve () {
    require(path.join(this.path, 'index'));
    return Promise.resolve();
  }

  interactive () {
    return new Promise( (resolve, reject) => {
      setTimeout(function () {
        green(" Application will now run in interactive mode");
        grey(' (ctrl + c) twice to exit interactive mode, then once more to quit the application\n');
        replHistory(repl.start(chalk.yellow("Glad > ")), path.join(process.cwd(), '.glad_history'));
        resolve();
      }, 1000);
    });
  }

  console () {
    process.env['CONSOLE_MODE'] = true;
    return this.serve().then(() => this.interactive());
  }

  api () {

    let resource = this.args._.slice(1)[0];
    let lower_name = lodash.toLower(resource);
    let plural_lower_name = pluralize(lower_name);
    let class_name = this.class_name = lodash.upperFirst(lower_name);
    let config = require(path.join(this.path, 'config'));
    let orm = config.orm || 'default';
    let adapter = config.defaultAdapter || '';
    let vars = [plural_lower_name, lower_name, class_name, orm, adapter];

    let templateDir = 'blueprints/api';

    this.modelPath      = path.join(this.path, 'models', `${lower_name}.js`);
    this.controllerPath = path.join(this.path, 'controllers', `${lower_name}.js`);
    this.routePath      = path.join(this.path, 'routes', `${lower_name}.js`);

    this.model = fs.readFileSync(path.join(this.cliDir, templateDir, orm, 'model.js'), 'utf8');
    this.controller = fs.readFileSync(path.join(this.cliDir, templateDir, orm, 'controller.js'), 'utf8');
    this.route = fs.readFileSync(path.join(this.cliDir, templateDir, 'common/route.js'), 'utf8');

    let modelExists = fs.existsSync(this.modelPath);
    let routeExists = fs.existsSync(this.routePath);
    let controllerExists = fs.existsSync(this.controllerPath);

    if (!adapter && orm === 'waterline') {
      orange('Your config does not have a defaultAdapter for waterline. You will need to specify the adapter in your model.');
    }

    return new Promise( (resolve, reject) => {

      let resources = [modelExists && this.modelPath.replace(this.path + '/', ''), routeExists && this.routePath.replace(this.path + '/', ''), controllerExists && this.controllerPath.replace(this.path + '/', '')].filter(x => x);

      if (resources.length) {
        red(`The following resources already exist.\n${resources.join('\n')}`);

        exists("Overwrite existing resources? [y/n]\n", answer => {
          if (answer === 'y') {
            this.createApiResources(vars);
          } else {
            green('Ok, Glad has done nothing destructive and will exit now.');
          }
          resolve();
        });

      } else {

        this.createApiResources(vars);
        resolve();
      }

    });

  }

  createApiResources (vars) {

    yellow(`Creating ${this.class_name}Controller`);
    this.controller = this.replaceTemplateVariables(this.controller, vars);
    yellow(`Creating ${this.class_name} Model`);
    this.model = this.replaceTemplateVariables(this.model, vars);
    yellow(`Creating ${this.class_name} Route`);
    this.route = this.replaceTemplateVariables(this.route, vars);

    fs.writeFileSync(this.modelPath, this.model, 'utf8');
    fs.writeFileSync(this.controllerPath, this.controller, 'utf8');
    fs.writeFileSync(this.routePath, this.route, 'utf8');

  }

  replaceTemplateVariables (tpl, vars) {
    let [plural_lower_name, lower_name, class_name, orm, adapter] = vars;
    tpl = tpl.replace(/{{plural_lower_name}}/g, plural_lower_name);
    tpl = tpl.replace(/{{lower_name}}/g, lower_name);
    tpl = tpl.replace(/{{class_name}}/g, class_name);
    tpl = tpl.replace(/{{orm}}/g, orm);
    tpl = tpl.replace(/{{adapter}}/g, adapter);
    return tpl;
  }

  run () {

  }

  destroy () {

  }

  copyOverBlueprint (folder) {
    return new Promise((resolve, reject) => {
      cpr(path.join(this.cliDir, `blueprints/common`), process.cwd(), { overwrite: true }, function (err) {
        cpr(folder, process.cwd(), { overwrite: true }, function(err) {
          return err ? reject(err) : resolve();
        });
      });
    });
  }

  initialize () {

    try {
      let pack = require(path.join(this.path, 'package.json'));
      if (pack) {
        red('Yikes! It seems like there is a package.json at this location. Refusing to overwrite existing node js project.');
        process.exit();
      }
    } catch (err) {}

    return new Promise( (resolve, reject) =>  {

      let odm = this.args.odm;
      let adapter = this.args.adapter || "sails-disk";
      let blueprint = odm || 'default';

      yellow(`creating a new ${odm || ''} project`);

      this.copyOverBlueprint(path.join(this.cliDir, `blueprints/${blueprint}`)).then( () => {

        let packageJson = require(path.join(this.path, 'package.json'));
        let config = require(path.join(this.path, 'config.js'));

        packageJson.dependencies.glad = `^${this.gladCliVersion}`;
        packageJson.author = process.env.USER;

        if (odm === 'waterline') {
          packageJson.dependencies.waterline = "^0.11.8";
          packageJson.dependencies[adapter]  = "latest";
        } else if (odm === 'mongoose') {
          packageJson.dependencies.mongoose  = '^4.0.8';
        }

        fs.writeFileSync(path.join(this.path, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');

        if (odm === 'waterline' && adapter) {
          config.defaultAdapter = adapter;
        }

        if ( (odm === 'waterline' && adapter === 'sails-mongo') || odm === 'mongoose') {
          config.mongodb = {
            host : 'localhost',
            port : 27017,
            database : 'app'
          };
          config.orm = odm;
          fs.writeFileSync(path.join(this.path, 'config.js'), 'module.exports = ' + JSON.stringify(config, null, 2), 'utf8');
        }

        this.npmInstall().then(resolve).catch(reject);

      }).catch(err => reject(err));

    });

  }

  npmInstall () {

    return new Promise( (resolve, reject) => {

      yellow("Installing Packages...");

      // Install any Dependencies
      let npm = child.spawn('npm', ['install'], {
        cwd: this.path
      });

      npm.stdout.setEncoding('utf8');

      npm.stdout.on('data', function(stdout) {
        console.log(yellow('NPM >  ' + stdout));
      });

      npm.on('close', function(code) {
        if (code === 0) {
          green("All Done! ");
        } else {
          red("ERROR: NPM could not install required packages, You will have to do it manually");
        }
        resolve();
      });
    });
  }

}
module.exports = Command;


// example commands
// glad api   [name]                   # Creates a new API
//# glad serve [-i]                     # Starts the server, pass in i for interactive mode
// glad run   [-i]                     # Runs a job or script in the same process as a new application server (without binding to a port). Pass in i for interactive mode
//# glad -v                             # Displays The Version of Glad
// glad destroy [name]                 # Destroys an API, removes the model, route, controller, and test
//# glad console                        # Creates an instance of the app in REPL & DEVELOPMENT MODE
// glad init --odm=[waterline|mongoose]# Creates a new Glad Project. Optionally, pass in the ODM you would like to use. (for the default stub only)
