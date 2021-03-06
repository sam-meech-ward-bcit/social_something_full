#!/usr/bin/node

const path = require("path");

const express = require("express");
const morgan = require("morgan");
const ec2Meta = require('./ec2Meta')

// const mongoDatabase = require("./database/mongoDatabase");
const mysqlDatabase = require("./database/mysqlDatabase");

const makePostsRouter = require("./routers/postsRouter");
const makeUsersRouter = require("./routers/usersRouter");
const makeGraphQlHTTP = require("./graphql/graphQlHTTP");

const images = require("./fileUpload/images")({
  uploadsPath: path.join(__dirname, "uploads/"),
  bucketName: process.env.BUCKET_NAME,
  region: process.env.BUCKET_REGION,
});

const app = express();
app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms")
);

const jwt = require("./jwt");

app.use(express.json());

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, "client/build")));

const mysqlConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};
mysqlDatabase(mysqlConfig).then((database) => {
  const postsRouter = makePostsRouter({
    database,
    imageUpload: images.postImageUpload,
    authorize: jwt.authenticateJWT,
  });
  app.use("/api/posts", postsRouter);

  const usersRouter = makeUsersRouter({
    database,
    authorize: jwt.authenticateJWT,
    generateAccessToken: jwt.generateAccessToken,
  });
  app.use("/api/users", usersRouter);

  const graphQL = makeGraphQlHTTP({
    database,
    authorize: jwt.authenticateJWT,
    imageUpload: images.postImageUpload,
    generateAccessToken: jwt.generateAccessToken,
  });
  app.use("/graphql", graphQL);

  app.get("/api/ec2", async (req, res) => {
    let ec2 = {}
    try {
      ec2.ipv4 = await ec2Meta.ipv4()
      ec2.hostname = await ec2Meta.hostname()
      ec2.instanceId = await ec2Meta.instanceId()
      ec2.publicIPv4 = await ec2Meta.publicIPv4();
      ec2.amiID = await ec2Meta.amiID();
      ec2.iam = await ec2Meta.iamInfo();
    } catch (err) {
      console.log(err)
      ec2 = "error"
    }
    res.send(ec2)
  })

  // Handles any requests that don't match the ones above
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname + "/client/build/index.html"));
  });
});

app.use(images.router);

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
