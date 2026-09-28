const restify = require('restify')
const mongojs = require('mongojs')

const db = mongojs('time', ['time'])

const arr = []

const server = restify.createServer()

server.use(restify.acceptParser(server.acceptable))
server.use(restify.queryParser())
server.use(restify.bodyParser())

server.listen(3000, function() {
	console.log('Server ' + server.name + ' running at ' + server.url)
})

server.get('time/get', function(req, res, next) {
	db.time.find((err, times) => {
		if (err) throw err
		res.json(times)
	})
	return next()
})

server.post('time/set/:id/:UTCtime', function (req, res, next) {
    var time = req.params
    var ID = req.params.id
    if (arr[ID] == null) {
    	db.time.save(time, function (err, data) {
    	if (err) {
    		throw err
    	}
    	res.json(data)
    	})
    	arr[ID] = true
    } else {
    	res.send('Please use PUT in order to update this Time')
    }
	return next()
})

server.get('time/get/:id/:zone', function(req, res, next) {
	db.time.findOne({
        id: req.params.id
    }, function (err, data) {
    	if (err) {
    		throw err
    	}
    	var offset = parseInt(req.params.zone)
    	data.time += offset * 3600000
        res.json(data)
    })
    return next()
})

server.put('time/set/:id/:UTCtime', function (req, res, next) {
    db.time.findOne({
        id: req.params.id
    }, function (err, data) {
        var newTime = req.params
        db.time.update({
            id: req.params.id
        }, newTime, {
            multi: false
        }, function (err, data) {
        	if (err) {
        		throw err
        	}
            res.json(data)
        })
    })
    return next()
})

server.delete('time/delete/:id', function(req, res, next) {
	db.time.remove({
		id: req.params.id
	}, function (err, time) {
		if (err) {
			throw err
		}
		res.json(time)
	})
	return next()
})

module.exports = server
