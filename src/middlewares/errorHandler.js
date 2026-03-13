const { buildSimpleTextResponse } = require('../utils/kakaoResponse');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.statusCode) {
    if (error.statusCode >= 500) {
      console.error(error);
    }

    return res
      .status(error.statusCode)
      .json(buildSimpleTextResponse(error.message));
  }

  console.error(error);

  return res
    .status(500)
    .json(
      buildSimpleTextResponse(
        '\uac80\uc0c9\ub7c9 \uc870\ud68c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4. \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.'
      )
    );
}

module.exports = errorHandler;
