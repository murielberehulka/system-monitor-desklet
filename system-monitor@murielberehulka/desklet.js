const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const Mainloop = imports.mainloop;
const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const Cinnamon = imports.gi.Cinnamon;
const Gio = imports.gi.Gio;
const Cairo = imports.cairo;
const St = imports.gi.St;
const Util = imports.misc.util;
const GLib = imports.gi.GLib;

const GIB_TO_KIB = 1048576; // 1 GiB = 1,048,576 kiB
const GB_TO_B = 1000000000; // 1 GB  = 1,000,000,000 B
const GIB_TO_MIB = 1024;    // 1 GiB = 1,042 MiB

function exec(argv) {
    let flags = (Gio.SubprocessFlags.STDOUT_PIPE |
                 Gio.SubprocessFlags.STDERR_PIPE);

    let proc = Gio.Subprocess.new(argv, flags);

    return new Promise((resolve, reject) => {
        proc.communicate_utf8_async(null, null, (proc, res) => {
            try {
                let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                let status = proc.get_exit_status();

                if (status !== 0) {
                    throw new Gio.IOErrorEnum({
                        code: Gio.io_error_from_errno(status),
                        message: stderr ? stderr.trim() : GLib.strerror(status)
                    });
                }

                resolve(stdout.trim());
            } catch (e) {
                reject(e);
            }
        });
    });
}

function MyDesklet(metadata, desklet_id) {
  this._init(metadata, desklet_id);
}

function main(metadata, desklet_id) {
  return new MyDesklet(metadata, desklet_id);
}

MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function(metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

        // initialize settings
        this.settings = new Settings.DeskletSettings(this, this.metadata["uuid"], desklet_id);
        this.settings.bindProperty(Settings.BindingDirection.IN, "type", "type", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "visual-type", "visual_type", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "rounded-border", "rounded_border", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "width", "width", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "cpu-variable", "cpu_variable", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "type", "type", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "filesystem", "filesystem", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "filesystem-label", "filesystem_label", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "gpu-manufacturer", "gpu_manufacturer", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "gpu-variable", "gpu_variable", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "gpu-id", "gpu_id", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "refresh-interval", "refresh_interval", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "duration", "duration", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "background-color", "background_color", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "h-midlines", "h_midlines", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "v-midlines", "v_midlines", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "scale-size", "scale_size", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "midline-color", "midline_color", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "text-color", "text_color", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-cpu", "line_color_cpu", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-ram", "line_color_ram", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-hdd", "line_color_hdd", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-gpu", "line_color_gpu", this.on_setting_changed);
        this.settings.bindProperty(Settings.BindingDirection.IN, "line-color-net", "line_color_net", this.on_setting_changed);

        // initialize desklet GUI
        this.setupUI();
    },

    setupUI: function(){
        // initialize this.canvas
        this.canvas = new Clutter.Actor();
        this.canvas.remove_all_children();
        this.text1 = new St.Label();
        this.text2 = new St.Label();
        this.text3 = new St.Label();
        this.canvas.add_actor(this.text1);
        this.canvas.add_actor(this.text2);
        this.canvas.add_actor(this.text3);
        this.setContent(this.canvas);

        // flag to indicate the first loop of the Desklet
        this.first_run = true;
        // update loop for Desklet
        this.update();
    },

    update: function() {
        // monitors a given variable and plot its graph
        let active = Cinnamon.get_file_contents_utf8_sync("/home/muriel/Documents/active_desklets");
        if(active == "1")
            this.update_draw();
        // call this.update() every in refresh_interval seconds
        this.timeout = Mainloop.timeout_add_seconds(this.refresh_interval, Lang.bind(this, this.update));
    },

    update_draw: async function() {
        // values needed in first run
        if (this.first_run){
            this.n_values = Math.floor(this.duration / this.refresh_interval)  + 1;
            this.values = new Array(this.n_values).fill(0.0);
            this.net_values = new Array(this.n_values).fill(0.0);
            this.net_n_values = 0;
            this.cpu_cpu_tot = 0;
            this.cpu_cpu_idl = 0;
            this.hdd_cpu_tot = 0;
            this.hdd_hdd_tot = 0;
            // set colors
            switch (this.type) {
              case "cpu":
                  this.line_color = this.line_color_cpu;
                  break;
              case "ram":
                  this.line_color = this.line_color_ram;
                  break;
              case "hdd":
                  this.line_color = this.line_color_hdd;
                  break;
              case "gpu":
                  this.line_color = this.line_color_gpu;
                  break;
              case "network":
                  this.line_color = this.line_color_net;
                  break;
            }
            this.first_run = false;
        }

        let is_chart = this.visual_type == "chart";

        // Desklet proportions
        let unit_size = parseInt(5 * this.scale_size);  // pixels
        var line_width = unit_size / 15;
        var margin_up = 3 * unit_size;
        var graph_w = this.width * unit_size;
        var graph_h = is_chart ?  4 * unit_size : 0;
        let desklet_w = graph_w + (2 * unit_size);
        let desklet_h = graph_h + (4 * unit_size);
        var h_midlines = this.h_midlines;
        var v_midlines = this.v_midlines;
        let text1_size = 4 * unit_size / 3;
        let text2_size = 4 * unit_size / 3;
        let text3_size = 3 * unit_size / 3;
        var radius = this.rounded_border ? 2 * unit_size / 3 : 0;
        var degrees = Math.PI / 180.0;

        let n_values = this.n_values;
        let values = this.values;
        let graph_step = graph_w / (n_values -1);

        var value = 0.0;
        var text1 = '';
        var text2 = '';
        var text3 = '';
        var line_colors = this.parse_rgba_seetings(this.line_color);

        // current values
        switch (this.type) {
            case "cpu":
                switch (this.cpu_variable) {
                    case "usage":
                        let cpu_use = this.get_cpu_use();
                        value = cpu_use / 100;
                        text1 = "CPU Usage";
                        text2 = Math.round(cpu_use).toString() + "%";
                        break;
                    case "temp":
                        let cpu_temp = await this.get_cpu_temp();
                        value = parseFloat(cpu_temp)/100;
                        text1 = "CPU Temp";
                        text2 = cpu_temp + "°C";
                        break;
                }
                break;

            case "ram":
                let ram_values = this.get_ram_values();
                let ram_use = 100 * ram_values[1] / ram_values[0];
                value = ram_use / 100;
                text1 = "RAM";
                text2 = Math.round(ram_use).toString() + "%"
                text3 = ram_values[1].toFixed(1) + " / "
                    + ram_values[0].toFixed(1) + " GiB";
                break;

            case "hdd":
                let dir_path = decodeURIComponent(this.filesystem.replace("file://", "").trim());
                if(dir_path == null || dir_path == "") dir_path = "/";
                let hdd_values = this.get_hdd_values(dir_path);
                let hdd_use = Math.min(hdd_values[1], 100); //already in %
                value = hdd_use / 100;
                text1 = this.filesystem_label;
                if (text1 == "") text1 = hdd_values[0];
                text2 = Math.round(hdd_use).toString() + "%"
                text3 = hdd_values[3].toFixed(0) + " GB free of "
                      + hdd_values[2].toFixed(0) + " GB";
                break;

            case "gpu":
                switch (this.gpu_manufacturer) {
                    case "nvidia":
                        switch (this.gpu_variable) {
                            case "usage":
                                let gpu_use = await this.get_nvidia_gpu_use();
                                value = gpu_use / 100;
                                text1 = "GPU Usage";
                                text2 = Math.round(gpu_use).toString() + "%";
                                break;
                            case "memory":
                                let gpu_mem_values = await this.get_nvidia_gpu_mem();
                                let gpu_mem_use = 100 * gpu_mem_values[1] / gpu_mem_values[0];
                                value = gpu_mem_use / 100;
                                text1 = "GPU Memory";
                                text2 = Math.round(gpu_mem_use).toString() + "%"
                                text3 = gpu_mem_values[1].toFixed(1) + " / "
                                    + gpu_mem_values[0].toFixed(1) + " GiB";
                                break;
                            case "fan_speed":
                                let gpu_fan_speed = await this.get_nvidia_gpu_fan_speed();
                                value = gpu_fan_speed / 100;
                                text1 = "GPU Fan";
                                text2 = Math.round(gpu_fan_speed).toString() + "%";
                                break;
                            case "temp":
                                let gpu_temp = await this.get_nvidia_gpu_temp();
                                value = gpu_temp / 100;
                                text1 = "GPU Temp";
                                text2 = Math.round(gpu_temp).toString() + "°C";
                                break;
                        }
                    break;

                    case "other":
                        break
                }
                break;

            case "network":
                let net_use = await this.get_net_use();
                this.net_values.push(net_use);
                this.net_values.shift();
                this.net_n_values += 1;
                if(this.net_n_values > this.n_values)
                    this.net_n_values = this.net_n_values;
                var total = 0;
                for(let v of this.net_values)
                    total += v;
                let average = total / this.net_n_values;
                let net_use_porc = average > 0 ? (net_use / average) / 2 : 0;
                value = net_use_porc > 1 ? 1 : net_use_porc;
                text1 = "NET Usage";
                let net_use_formated = net_use > 1000 ? net_use * 0.0009765625 : net_use;
                let net_use_format = net_use > 1000 ? " MB/S" : " KB/S";
                text2 = net_use_formated.toFixed(2) + net_use_format;
                break;
        }

        var background_colors = this.parse_rgba_seetings(this.background_color);
        var midline_colors;

        // concatenate new value
        if(is_chart) {
            values.push(value);
            values.shift();
            this.values = values;
            midline_colors = this.parse_rgba_seetings(this.midline_color)
        }


        // draws graph
        let canvas = new Clutter.Canvas();
        canvas.set_size(desklet_w, desklet_h);

        switch (this.visual_type) {
            case "chart":
                canvas.connect('draw', function (canvas, ctx, desklet_w, desklet_h) {
                    ctx.save();
                    ctx.setOperator(Cairo.Operator.CLEAR);
                    ctx.paint();
                    ctx.restore();
                    ctx.setOperator(Cairo.Operator.OVER);
                    ctx.setLineWidth(2 * line_width);

                    // desklet background
                    ctx.setSourceRGBA(background_colors[0], background_colors[1], background_colors[2], background_colors[3]);
                    ctx.newSubPath();
                    ctx.arc(desklet_w - radius, radius, radius, -90 * degrees, 0 * degrees);
                    ctx.arc(desklet_w - radius, desklet_h - radius, radius, 0 * degrees, 90 * degrees);
                    ctx.arc(radius, desklet_h - radius, radius, 90 * degrees, 180 * degrees);
                    ctx.arc(radius, radius, radius, 180 * degrees, 270 * degrees);
                    ctx.closePath();
                    ctx.fill();

                    // graph border
                    ctx.setSourceRGBA(line_colors[0], line_colors[1], line_colors[2], 1);
                    ctx.rectangle(unit_size, margin_up, graph_w, graph_h);
                    ctx.stroke();

                    // graph V and H midlines
                    ctx.setSourceRGBA(midline_colors[0], midline_colors[1], midline_colors[2], 1);
                    ctx.setLineWidth(line_width);
                    for (let i = 1; i<v_midlines; i++){
                        ctx.moveTo((i * graph_w / v_midlines) + unit_size, margin_up);
                        ctx.relLineTo(0, graph_h);
                        ctx.stroke();
                    }
                    for (let i = 1; i<h_midlines; i++){
                        ctx.moveTo(unit_size, margin_up + i * (graph_h / h_midlines));
                        ctx.relLineTo(graph_w, 0);
                        ctx.stroke();
                    }

                    // timeseries and area
                    ctx.setLineWidth(2 * line_width);
                    ctx.setSourceRGBA(line_colors[0], line_colors[1], line_colors[2], 1);
                    ctx.moveTo(unit_size, margin_up + graph_h - (values[0] * graph_h));
                    for (let i = 1; i<n_values; i++){
                        ctx.lineTo(unit_size + (i * graph_step), margin_up + graph_h - (values[i] * graph_h));
                    }
                    ctx.strokePreserve();
                    ctx.lineTo(unit_size + graph_w, margin_up + graph_h);
                    ctx.lineTo(unit_size, margin_up + graph_h);
                    ctx.closePath();
                    ctx.setSourceRGBA(line_colors[0], line_colors[1], line_colors[2], 0.4);
                    ctx.fill();

                    return false;
                });
                break;
            case "text":
                canvas.connect('draw', function (canvas, ctx, desklet_w, desklet_h) {
                    ctx.save();
                    ctx.setOperator(Cairo.Operator.CLEAR);
                    ctx.paint();
                    ctx.restore();
                    ctx.setOperator(Cairo.Operator.OVER);

                    // desklet background
                    ctx.setSourceRGBA(background_colors[0], background_colors[1], background_colors[2], background_colors[3]);
                    ctx.newSubPath();
                    ctx.arc(desklet_w - radius, radius, radius, -90 * degrees, 0 * degrees);
                    ctx.arc(desklet_w - radius, desklet_h - radius, radius, 0 * degrees, 90 * degrees);
                    ctx.arc(radius, desklet_h - radius, radius, 90 * degrees, 180 * degrees);
                    ctx.arc(radius, radius, radius, 180 * degrees, 270 * degrees);
                    ctx.closePath();
                    ctx.fill();

                    return false;
                });
                break;
        }
        canvas.invalidate();
        this.canvas.set_content(canvas);

        // text position and content
        this.text1.set_position(unit_size, unit_size);
        this.text1.set_text(text1);
        this.text1.style = "font-size: " + text1_size + "px;"
                         + "color: " + this.text_color + ";";
        this.text2.set_position((text1_size * 15) / 2, unit_size);
        this.text2.set_text(text2);
        this.text2.style = "font-size: " + text2_size + "px;"
                         + "color: " + this.text_color + ";";
        this.text3.set_text(text3);
        this.text3.style = "font-size: " + text3_size + "px;"
                         + "color: " + this.text_color + ";";
        this.text3.set_position((this.width * unit_size) - this.text3.get_width() + 10, unit_size * 1.3333);

        // update canvas
        this.canvas.set_size(desklet_w, desklet_h);
    },

    on_setting_changed: function() {
        // settings changed; instant refresh
        Mainloop.source_remove(this.timeout);
        this.first_run = true;
        this.update();
   },

    on_desklet_removed: function() {
        Mainloop.source_remove(this.timeout);
    },

    get_cpu_use: function() {
        // https://rosettacode.org/wiki/Linux_CPU_utilization
        let cpu_line = Cinnamon.get_file_contents_utf8_sync("/proc/stat").match(/cpu\s.+/)[0];
        let cpu_values = cpu_line.split(/\s+/);
        let cpu_idl = parseFloat(cpu_values[4]);
        let cpu_tot = 0;
        for (let i = 1; i<10; i++){
          cpu_tot += parseFloat(cpu_values[i])
        }
        let cpu_use = 100 * (1 - (cpu_idl - this.cpu_cpu_idl) / (cpu_tot - this.cpu_cpu_tot));
        this.cpu_cpu_tot = cpu_tot;
        this.cpu_cpu_idl = cpu_idl;
        return cpu_use;
    },
    get_cpu_temp: async function() {
        const data = await exec(["sensors"]);
        let res = (data + "").substring(55, 59);
        return res;
    },

    get_ram_values: function() {
        // used  = total - available
        let mem_out = Cinnamon.get_file_contents_utf8_sync("/proc/meminfo");
        let mem_tot = parseInt(mem_out.match(/(MemTotal):\D+(\d+)/)[2]);
        let mem_usd = mem_tot - parseInt(mem_out.match(/(MemAvailable):\D+(\d+)/)[2]);

        let ram_tot = mem_tot / GIB_TO_KIB;
        let ram_usd = mem_usd / GIB_TO_KIB;
        return [ram_tot, ram_usd];
    },

    get_hdd_values: function(dir_path) {
        let subprocess = new Gio.Subprocess({
            argv: ['/bin/df', dir_path],
            flags: Gio.SubprocessFlags.STDOUT_PIPE,
        });
        subprocess.init(null);
        let [, out] = subprocess.communicate_utf8(null, null); // get full output from stdout
        let df_line = out.match(/.+/g)[1];
        let df_values = df_line.split(/\s+/); // split by space
        // values for partition space
        let hdd_tot = parseFloat(df_values[1]) * 1024 / GB_TO_B;
        let hdd_fre = parseFloat(df_values[3]) * 1024 / GB_TO_B;
        // utilization of partition
        let dev_fs = df_values[0];
        let fs = dev_fs.split(/\/+/)[2];
        let hdd_use = this.get_hdd_use(fs);
        return [fs, hdd_use, hdd_tot, hdd_fre];
    },

    get_hdd_use: function(fs) {
      // https://stackoverflow.com/questions/4458183/how-the-util-of-iostat-is-computed
      let cpu_line = Cinnamon.get_file_contents_utf8_sync("/proc/stat").match(/cpu\s.+/)[0];
      let re = new RegExp(fs + '.+');
      let hdd_line = Cinnamon.get_file_contents_utf8_sync("/proc/diskstats").match(re)[0];
      // get total CPU time
      let cpu_values = cpu_line.split(/\s+/);
      let hdd_cpu_tot = 0;
      for (let i = 1; i<10; i++){
        hdd_cpu_tot += parseFloat(cpu_values[i])
      }
      // get total of IO times
      let hdd_hdd_tot = hdd_line.split(/\s+/)[10];
      // update HHD use
      let hdd_use = 100 * (hdd_hdd_tot - this.hdd_hdd_tot) / (hdd_cpu_tot - this.hdd_cpu_tot);
      // update global values
      this.hdd_cpu_tot = hdd_cpu_tot;
      this.hdd_hdd_tot = hdd_hdd_tot;

      return hdd_use;
    },

    parse_rgba_seetings: function(color_str) {
        let colors = color_str.match(/\((.*?)\)/)[1].split(","); // get contents inside brackets: "rgb(...)"
        let r = parseInt(colors[0])/255;
        let g = parseInt(colors[1])/255;
        let b = parseInt(colors[2])/255;
        let a = 1;
        if (colors.length > 3) a = colors[3];
        return [r, g, b, a];
    },

    get_nvidia_gpu_use: async function() {
        const data = await exec(["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv", "--id="+this.gpu_id]);
        let gpu_use =  parseInt(data.toString().match(/[^\r\n]+/g)[1]); // parse integer in second line
        return gpu_use;
    },

    get_nvidia_gpu_mem: async function() {
        const mem_tot_exec = await exec(["nvidia-smi", "--query-gpu=memory.total", "--format=csv", "--id="+this.gpu_id]);
        let mem_tot =  parseInt(mem_tot_exec.toString().match(/[^\r\n]+/g)[1]); // parse integer in second line
        const mem_usd_exec = await exec(["nvidia-smi", "--query-gpu=memory.used", "--format=csv", "--id="+this.gpu_id]);
        let mem_usd =  parseInt(mem_usd_exec.toString().match(/[^\r\n]+/g)[1]); // parse integer in second line
        let gpu_mem_tot = mem_tot / GIB_TO_MIB;
        let gpu_mem_usd = mem_usd / GIB_TO_MIB;
        return [gpu_mem_tot, gpu_mem_usd];
    },

    get_nvidia_gpu_fan_speed: async function() {
        const data = await exec(["nvidia-smi", "--query-gpu=fan.speed", "--format=csv", "--id="+this.gpu_id]);
        let fan_speed =  parseInt(data.toString().match(/[^\r\n]+/g)[1]); // parse integer in second line
        return fan_speed;
    },

    get_nvidia_gpu_temp: async function() {
        const data = await exec(["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv", "--id="+this.gpu_id]);
        let temp =  parseInt(data.toString().match(/[^\r\n]+/g)[1]); // parse integer in second line
        return temp;
    },

    get_net_use: async function() {
        const data = await exec(["net-usage"]);
        return parseFloat(data);
    }

};
