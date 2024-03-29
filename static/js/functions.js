window.onload = function() {  
    var button = document.getElementById("hamburger");
    button.addEventListener("touchstart", hamburger);
    button.addEventListener("click", hamburger);

    // parse if user selects file
    var inputElement = document.getElementById("myfile");
    inputElement.onchange = function(event) {
        var fileList = inputElement.files;
        Chart.defaults.global.defaultFontFamily = "'Poppins', sans-serif";

        // if changing data file without reloading page
        // destroy the previous graphs or visual error occur
        if (typeof window.yearlyChart !== 'undefined') {
            window.yearlyChart.destroy();
            window.accumulativeChart.destroy();
            window.monthlyChart.destroy();
            window.monthlyComparisonChart.destroy();
            window.companyTotalChart.destroy();
        }
        
        var file = fileList[0];
        parseFile(file);
    }
}

/* Toggle between showing and hiding the navigation menu links */
function hamburger(event) {
    var x = document.getElementById("myLinks");
    if (x.style.display === "block") {
        x.style.display = "none";
    } else {
        x.style.display = "block";
    }
    event.stopPropagation();
    event.preventDefault();
} 

/**
 * Parse Avanza CSV file.
 * @param {*} file 
 */
function parseFile(file) {
    Papa.parse(file, {
        complete: function(results) {
            var firstRow = results['data'][0];
            console.log(firstRow)
            
            // basic check that correct file was inserted
            if (typeof firstRow != 'undefined' && firstRow[0] == 'Datum' && firstRow[1] == 'Konto') {
                var dividendRows = [];
                for (var i = 1; i < results['data'].length; i++) {
                    // Only use dividend rows
                    if (results['data'][i][2] == "Utdelning") {
                        dividendRows.push(results['data'][i]);
                    }
                }
                console.log(dividendRows);
                yearlyDividends(dividendRows);
                movingAverage(dividendRows);
                accumulative(dividendRows);
                monthComparisonByYear(dividendRows);
                companyBarChart(dividendRows);
                document.getElementById("panel-container").style.display = "block";
                document.getElementById("chart-container").style.display = "block";
                document.getElementById("panel-container").scrollIntoView({ block: 'start',  behavior: 'smooth' });
            } else {
                // don't show empty graphs if invalid file
                document.getElementById("panel-container").style.display = "none";
                document.getElementById("chart-container").style.display = "none";
                alert('Ogiltig fil inmatad! Är du säker på att du valt rätt fil?');
            }
        }
    });
}

/**
 * Round number to two decimal points.
 * @param {*} number 
 */
function round(number) {
    return Math.round((number + Number.EPSILON) * 100) / 100;
}

/**
 * Dislay total dividens received for each year.
 * @param {*} data 
 */
function yearlyDividends(data) {    
    // calculate data
    var years = {};
    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        // break at the end of the data 
        if (row.length != 10) break;

        var date = new Date(Date.parse(row[0]));
        year = date.getFullYear();
        if (!(year in years)) {
            years[year] = 0;
        }
        years[year] += parseFloat(row[6].replace(",", "."));
    }

    // sort keys
    keys = [];
    for (var key in years) {
        keys.push(key);
    }
    keys.sort();

    var data = [];
    var total = 0;
    for (const key of keys) {
        var value = years[key];
        total += value
        data.push(round(value));
    }

    // update panels, done here to not calculate same thing twice
    document.getElementById("total-divs").innerHTML = round(total).toLocaleString("se-SE") + " SEK";
    var dividendGrowth = round((years[keys[keys.length-1]]-years[keys[keys.length-2]])/years[keys[keys.length-2]])*100;
    document.getElementById("div-growth").innerHTML = dividendGrowth.toLocaleString("se-SE") + "%";
    if (dividendGrowth >= 0) {
        document.getElementById("div-growth").classList.add("green");
    } else {
        document.getElementById("div-growth").classList.add("red");
    }

    // draw chart
    var ctx = document.getElementById('yearly-divs').getContext('2d');
    var myBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: keys,
            datasets: [
              {
                label: "Utdelning",
                data: data,
                backgroundColor: "#639cff",
              }
            ]
          },
        options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    yAxes: [
                        {
                            ticks: {
                                callback: function(label, index, labels) {
                                    return label/1000+'k';
                                }
                            },
                        }
                    ]
                },
                hover: {
                    animationDuration: 0
                },
                tooltips: {
                    enabled: true,
                    mode: 'single',
                    callbacks: {
                        label: function(tooltipItems, data) { 
                            return tooltipItems.yLabel + ' SEK';
                        }
                    }
                },
                legend: {
                    onClick: (e) => e.stopPropagation()
                },
                // place numbers over bars
                // TODO: investigate if this is redrawn too much
                animation: {
                    duration: 1,
                    onComplete: function () {
                        var chartInstance = this.chart,
                            ctx = chartInstance.ctx;
                        ctx.font = Chart.helpers.fontString(Chart.defaults.global.defaultFontSize, Chart.defaults.global.defaultFontStyle, Chart.defaults.global.defaultFontFamily);
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        
                        this.data.datasets.forEach(function (dataset, i) {
                            var prevData = 0;
                            var meta = chartInstance.controller.getDatasetMeta(i);
                            meta.data.forEach(function (bar, index) {
                                var data = dataset.data[index];
                                if (prevData != 0) {
                                    var percentageDiff = (data - prevData)/prevData * 100;  
                                    ctx.fillText(round(percentageDiff) + "%", bar._model.x, bar._model.y - 5);                       
                                }
                                prevData = data;
                            });
                        });
                    }
                }
        },
    });
    window.yearlyChart = myBarChart;
}

/**
 * Compute total received dividends for each month.
 * @param {*} data 
 */
function sumMonth(data) {
    result = {};
    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        // break at the end of the data 
        if (row.length != 10) break;

        var date = new Date(Date.parse(row[0]));
        if (!(date.getFullYear() in result)) {
            var length = date.getMonth()+1;
            if (length > 12) {
                length = 12;
            }
            result[date.getFullYear()] = Array(length).fill(0);
        }
        result[date.getFullYear()][date.getMonth()] += parseFloat(row[6].replace(",", "."));
    }
    return result;
}

/**
 * Display 12 month moving average.
 * @param {*} data 
 */
function movingAverage(data) {
    var result = sumMonth(data);

    var labels = [];
    var datapoints = [];

    // sort by year
    var keys = [];
    for (var key in result) {
        keys.push(key);
    }
    keys.sort();

    // update every month panel, done here to not calculate same thing twice
    var current_year = result[keys[keys.length-1]];
    var currentTime = new Date();
    var currentMonth = currentTime.getMonth();
    var averageMonth = round(current_year.reduce(function(a, b) { return a + b; }, 0)/(currentMonth+1));
    document.getElementById("div-average-month").innerHTML = averageMonth.toLocaleString("se-SE") + " SEK";

    // convert into correct format for charts
    for (const key of keys) {
        var months = result[key];
        for (var i = 0; i < months.length; i++) {
            var date = new Date(key,i,1);
            labels.push(date);
            datapoints.push({t:date, y:round(months[i])});
        }
    }
    //last_year = keys[keys.length-1]
    

    var movingAvg = [];
    var factor = 12
    // calculate moving average
    for (var i = 0; i < datapoints.length; i++) {
        var sum = 0
        for (var j = 0; j < factor; j++) {
            var index = i-j;
            if (!(index < 0)) {
                sum += datapoints[i-j]['y'];
            }
        }
        movingAvg[i] = round(sum/factor);
    }

    // draw chart
    var ctx = document.getElementById('moving-avg-divs').getContext('2d'); 
    var mixedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            datasets: [{
                label: 'Utdelning',
                data: datapoints,
                backgroundColor: "#639cff",
            }, {
                label: '12 månader rullande utdelning',
                data: movingAvg,
                borderColor: '#00c281',
                backgroundColor: "#f8fdfb",
                pointBorderColor: "#00c281",
                pointBackgroundColor: "#f8fdfb",
    
                // Changes this dataset to become a line
                type: 'line'
            }],
            labels: labels
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        tooltipFormat: 'MMM YYYY',
                        displayFormats: {
                            quarter: 'MMM YYYY'
                        }
                    },
                }],
                yAxes: [
                    {
                        ticks: {
                            callback: function(label, index, labels) {
                                return label/1000+'k';
                            }
                        },
                    }
                ]
            },
            tooltips: {
                enabled: true,
                mode: 'single',
                callbacks: {
                    label: function(tooltipItems, data) { 
                        return tooltipItems.yLabel + ' SEK';
                    }
                }
            },
            legend: {
                onClick: (e) => e.stopPropagation()
            }
        }
    });
    window.monthlyChart = mixedChart;
}

/**
 * Display accumulative dividends received.
 * @param {*} data 
 */
function accumulative(data) {
    var labels = [];
    var datapoints = [];
    var sum = 0;
    for (var i = data.length-1; i > 0; i--) {
        var row = data[i];

        var date = new Date(Date.parse(row[0]));
        var amount = parseFloat(row[6].replace(",", "."));
        labels.push(date);
        sum += amount;
        datapoints.push({t:date, y:round(sum)});
    }

    var ctx = document.getElementById('accumulative').getContext('2d'); 
    var chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
              {
                label: "Total utdelning",
                data: datapoints,
                borderColor: '#00c281',
                backgroundColor: "#f8fdfb",
                pointBorderColor: "#00c281",
                pointBackgroundColor: "#f8fdfb",
                lineTension: 0,
              }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                xAxes: [{
                    type: 'time',
                    time: {
                        unit: 'month',
                        tooltipFormat: 'll'
                    }
                }],
                yAxes: [
                    {
                        ticks: {
                            callback: function(label, index, labels) {
                                return label/1000+'k';
                            }
                        },
                    }
                ],
            },
            tooltips: {
                enabled: true,
                mode: 'single',
                callbacks: {
                    label: function(tooltipItems, data) { 
                        return tooltipItems.yLabel + ' SEK';
                    }
                }
            },
            legend: {
                onClick: (e) => e.stopPropagation()
            }
        }
    });
    window.accumulativeChart = chart;
}

function monthComparisonByYear(data) {
    var permonth = sumMonth(data);
    var datasets = [];

    // sort by year
    var keys = [];
    for (var key in permonth) {
        keys.push(key);
    }
    keys.sort();

    for (const key of keys) {
        datasets.push({
            label: key,
            type: "bar",
            data: permonth[key].map(round),
            fill: false
        });
    }

    var ctx = document.getElementById('monthly-comparison').getContext('2d');
    var chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            barValueSpacing: 20,
            scales: {
                yAxes: [
                    {
                        ticks: {
                            callback: function(label, index, labels) {
                                return label/1000+'k';
                            }
                        },
                    }
                ],
            },
            plugins: {
                colorschemes: {
                  scheme: 'tableau.Tableau10'
                }
              }
        }
    });

    window.monthlyComparisonChart = chart;
}

function companyBarChart(data) {
    var companies = {};
    for (var i = 1; i < data.length; i++) {
        var row = data[i];
        // break at the end of the data 
        if (row.length != 10) break;
        var companyName = row[3];
        var divAmount = parseFloat(row[6].replace(",", "."));;

        if (companyName in companies) {
            companies[companyName] += divAmount;
        } else {
            companies[companyName] = divAmount;
        }
    }
    sortedCompanies = Object.keys(companies).sort(function(a,b){return companies[a]-companies[b]});
    var data = [];
    for (const company of sortedCompanies) {
        data.push(round(companies[company]));
    }
    sortedCompanies.reverse();
    data.reverse();

    // draw chart
    var ctx = document.getElementById('div-per-company').getContext('2d');
    var myBarChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedCompanies,
            datasets: [
              {
                label: "Utdelning",
                data: data,
                backgroundColor: "#639cff",
              }
            ]
          },
        options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { 
                    yAxes: [
                        {
                            ticks: {
                                callback: function(label, index, labels) {
                                    return label/1000+'k';
                                }
                            },
                        }
                    ]
                },
                tooltips: {
                    enabled: true,
                    mode: 'single',
                    callbacks: {
                        label: function(tooltipItems, data) { 
                            return tooltipItems.yLabel + ' SEK';
                        }
                    }
                },
        },
    });
    window.companyTotalChart = myBarChart;
}