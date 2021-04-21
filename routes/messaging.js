var express = require("express");
const getCollection = require("../connectors");
var router = express.Router();
const { ObjectID } = require("mongodb");
var twilio = require("twilio");
const nodemailer = require("nodemailer");
const fs = require("fs");
const { request } = require("express");
const url = "http://172.25.22.175:8080";
function contactEmailTemplate(data) {
  return {
    to: data.to, // list of receivers
    subject: "C-Trace Exposure Contact", // Subject line
    text:
      "Hello, " +
      data.name +
      ", you have been in contact with someone " +
      "who just tested positive for COVID19.\n" +
      "According to our records, this contact occured on " +
      data.doc +
      ".\n" +
      "Please follow this link to fill out a Covid Contact Form:" +
      url +
      "/contact?id=" +
      data.id +
      "\nIf you believe this email was sent in error, " +
      "please contact your local health authority for verification." +
      "\n-your local health authority,\n" +
      "This email was generated by C-Trace. For more information go to C-trace.com or contact c.trace.contact@gmail.com.",
  };
}

function caseEmailTemplate(data) {
  return {
    to: data.to, // list of receivers
    subject: "C-Trace COVID Positive Form", // Subject line
    text:
      "Hello " +
      data.name +
      ", according to our records, you have " +
      "tested positive for COVID19 or are developing symptoms " +
      "after a known COVID19 exposure.\n" +
      "Please follow this link to fill out a Covid Postivite Case Form:" +
      url +
      "/case?id=" +
      data.id +
      "\nIf you believe this email was sent in error, " +
      "please contact your local health authority for verification." +
      "\n-your local health authority,\n" +
      "This email was generated by C-Trace. For more information go to C-trace.com or contact c.trace.contact@gmail.com.",
  };
}

async function sendEmail(emailData, res) {
  let transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: "c.trace.contact@gmail.com", // generated ethereal user
      pass: "sloppy-joes", // generated ethereal password
    },
  });
  // send mail with defined transport object
  let info = await transporter.sendMail({
    ...emailData,
    from: '"College of the Ozarks" <c.trace.contact@gmail.com>',
  });

  res.send({ messageID: info.messageId, to: emailData.to });
  // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
}

router.post("/contact/:id", function (req, res, next) {
  if (req.params.id) {
    if (req.params.id == "all") {
      next();
    } else {
      getCollection(async (collection) => {
        const query = { _id: ObjectID(req.params.id), status: "Exposed" };
        const person = await collection.findOne(query);
        if (person) {
          //   if (false) {
          if (person.phone) {
            let rawdata = fs.readFileSync("./tokens.json");
            let { accountSid, authToken } = JSON.parse(rawdata);
            console.log(accountSid);
            var client = new twilio(accountSid, authToken);
            client.messages
              .create({
                body:
                  "Hello, " +
                  person.name +
                  ", you have been in contact with someone " +
                  "who has COVID19.\n" +
                  "According to our records, this contact occured on " +
                  new Date(person.doc).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }) +
                  ".\nPlease click this link to fill out our COVID19 form: " +
                  url +
                  "/contact?id=" +
                  req.params.id +
                  "\nor contact c.trace.contact@gmail.com for more information.",
                to:
                  "+1" +
                  person.phone
                    .split("")
                    .filter((letter) => "1234567890".split("").includes(letter))
                    .join(""), // Text this number
                from: "+14055823794", // From a valid Twilio number
              })
              .then((message) =>
                res.send({
                  sid: message.sid,
                  message: "Message sent to " + person.phone,
                })
              );
            // Do Twilio Code
          } else {
            if (person.email) {
              let emailData = contactEmailTemplate({
                to: '"' + person.name + '" <' + person.email + ">",
                name: person.name,
                doc: person.doc,
                id: req.params.id,
              });

              sendEmail(emailData, res);
            } else {
              res
                .status(400)
                .send({ err: "No Contact Info found for id ${id}" });
            }
          }
        } else {
          res
            .status(400)
            .send({ err: "No Active Contact under ID " + req.params.id });
        }
      });
    }
  } else {
    res.status(400).send({ err: "Could not find Parameter ID" });
  }
});

router.post("/case", function (req, res, next) {
  getCollection(async (collection) => {
    const filter = { name: req.body.name };
    filter[req.body.type.toLowerCase()] = req.body.info.toLowerCase();
    const query = { $set: { status: "Positive" } };
    var response = await collection.findOne(filter);
    var id;
    if (response) {
      id = response._id;
      const x = await collection.updateOne(
        { _id: ObjectID(response._id) },
        query
      );
      // console.log(x); //
    } else {
      const entry = { ...filter, status: "Positive" };
      entry[req.body.dType] = new Date(req.body.date);
      response = await collection.insertOne(entry);
      id = response.ops[0]._id;
    }
    if (req.body.type === "Phone") {
      let rawdata = fs.readFileSync("./tokens.json");
      let { accountSid, authToken } = JSON.parse(rawdata);
      console.log(accountSid);
      let t =
        req.body.dType === "doso"
          ? "you developed covid symptoms starting on " +
            new Date(req.body.date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            }) +
            ". "
          : "your COVID19 test taken on " +
            new Date(req.body.date).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            }) +
            " came back positive. ";
      var client = new twilio(accountSid, authToken);
      client.messages
        .create({
          body:
            req.body.name +
            ": according to our records, " +
            t +
            "Please follow this link to fill out our COVID form " +
            url +
            "/case?id=" +
            id +
            " and begin the quarantine process.",
          to:
            "+1" +
            req.body.info
              .split("")
              .filter((letter) => "1234567890".split("").includes(letter))
              .join(""), // Text this number
          from: "+14055823794", // From a valid Twilio number
        })
        .then((message) =>
          res.send({
            sid: message.sid,
            message: "message sent to " + req.body.info,
          })
        );
      // Do Twilio Code
    } else {
      if (req.body.type === "Email") {
        let emailData = caseEmailTemplate({
          to: '"' + req.body.name + '" <' + req.body.info + ">",
          name: req.body.name,
          id: id,
        });

        sendEmail(emailData, res);
      } else {
        res
          .status(400)
          .send({ err: "No Contact Info found for " + req.body.name });
      }
    }
  });
});
//MOST LIKELY WONT USE
router.post("/case/all", (req, res, next) => {
  res.send("Twilio Send Case All");
});
//JUST MIGHT
router.post("/contact/all", function (res, end, next) {
  res.send("Twilio Send Contact All");
});

module.exports = express.Router().use("/messaging", router);
