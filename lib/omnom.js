/*
   ____            _   _                   _     
  / __ \          | \ | |                 (_)    
 | |  | |_ __ ___ |  \| | ___  _ __ ___    _ ___ 
 | |  | | '_ ` _ \| . ` |/ _ \| '_ ` _ \  | / __|
 | |__| | | | | | | |\  | (_) | | | | | |_| \__ \
  \____/|_| |_| |_|_| \_|\___/|_| |_| |_(_) |___/
                                         _/ |    
                A Jank Ass-Parser       |__/     

This code is released under the public domain.
*/


(function () {
  "use strict"


  var Parser = function (maxDepth, tokenDefs, symbolDefs) {


    var tokenTypes = _.object(_.map(tokenDefs, function (pattern, t) {
      try { var re = RegExp(pattern, "mg") }
      catch (e) { throw {type:"Token Specification", token:t} }
      return [t, re]
    }))


    var symbolTypes = _.object(_.map(symbolDefs, function (rules, s) {
      rules = rules.split(/\s+\|\s+/)
      return [s, _.map(rules, function (symbols) {
        symbols = symbols.split(/\s+/)
        return symbols
      })]
    }))


    var parse = function (input) {
      var tokens = tokenize(input)
      if (tokens.error != undefined)
        return {error:{
          type:  "Tokenization",
          start: tokens.error,
          end:   tokens.error
        }}

      var table = makeTable(tokens)
      var result = parseSymbol(table, tokens, "INPUT", 0, 0)
      if (result.length == undefined || result.length < tokens.length-1)
        if (tokens.length == 0)
          return {error:{
            type:  "Parse",
            start: 0,
            end:   0,
          }}
        else
          return {error:{
            type:  "Parse",
            start: tokens[result.error].start,
            end:   tokens[result.error].end,
          }}

      return niceTree(input, tokens, result.tree)
    }


    var tokenize = function (input) {
      var index = 0
      var tokens = []

      while (index < input.length) {
        var maxLength = 0
        var maxType

        _.each(tokenTypes, function (pattern, type) {
          pattern.lastIndex = index
          var match = pattern.exec(input)
          if (match && match.index == index && match[0].length > maxLength) {
            maxLength = match[0].length
            maxType = type
          }
        })

        if (maxLength == 0)
          return {error:index}

        if (maxType.charAt(0) == "!")
          return {error:index}

        if (maxType.charAt(0) != "$")
          tokens.push({type:maxType, start:index, end:index+maxLength})

        index += maxLength
      }

      tokens.push({type:"end of input", start:input.length, end:input.length})
      return tokens
    }


    var ttree = function (token) {
      return {token:token}
    }


    var stree = function (symbol, rule) {
      return {
        symbol:   symbol,
        rule:     rule,
        children: [],
      }
    }


    var makeTable = function (tokens) {
      return _.map(tokens, function () { return {} })
    }


    var parseSymbol = function (table, tokens, curSymbol, curToken, depth) {
      if (curToken >= tokens.length) return {error:tokens.length-1}
      if (depth    >= maxDepth)      return {error:tokens.length-1}

      if (!table[curToken][curSymbol]) {

        if (tokenTypes[curSymbol]) {
          if (tokens[curToken].type == curSymbol) {
            table[curToken][curSymbol] = {length:1, error:0, tree:ttree(curToken)}
          }
          else {
            table[curToken][curSymbol] = {error:curToken}
          }
        }

        else if (symbolTypes[curSymbol]) {
          var c = {length:-1, error:curToken}

          for (var r = 0; r < symbolTypes[curSymbol].length; ++r) {
            var result = parseRule(table, tokens, curSymbol, curToken, r, depth)

            c.error = Math.max(c.error, result.error)

            if (result.length > c.length) {
              c.length = result.length
              c.tree   = result.tree
            }
          }

          if (c.length == -1) delete c.length
          table[curToken][curSymbol] = c
        }

        else {
          throw "Much badness at " + curSymbol + ", " + curToken
        }

      }

      return table[curToken][curSymbol]
    }


    var parseRule = function (table, tokens, symbol, token, rule, depth) {
      var c = {
        length: 0,
        error:  token,
        tree:   stree(symbol, rule)
      }

      var expansion = symbolTypes[symbol][rule]
      for (var i = 0; i < expansion.length; ++i) {
        var curSymbol = expansion[i]
        var meta      = curSymbol.charAt(0) == "@"
        var silent    = curSymbol.charAt(0) == "$"
        var nonEmpty  = curSymbol.charAt(curSymbol.length-1) != "*" &&
                        curSymbol.charAt(curSymbol.length-1) != "?"
        var repeat    = curSymbol.charAt(curSymbol.length-1) == "*" ||
                        curSymbol.charAt(curSymbol.length-1) == "+" ||
                        curSymbol.charAt(curSymbol.length-1) == "?"
        var onlyOnce  = curSymbol.charAt(curSymbol.length-1) == "?"

        if (meta)   curSymbol = curSymbol.substring(1)
        if (silent) curSymbol = curSymbol.substring(1)
        if (repeat) curSymbol = curSymbol.substring(0, curSymbol.length-1)

        if (nonEmpty) {
          var curDepth = c.length == 0 ? depth+1 : 0
          var result = parseSymbol(table, tokens, curSymbol, token+c.length, curDepth)
          
          c.error = Math.max(c.error, result.error)
          if (result.length == undefined) {
            delete c.length
            delete c.tree
            break
          }

          c.length += result.length
            if (meta && result.tree.children)
              _.each(result.tree.children, function (child) {
                c.tree.children.push(child)
              })
            if (!meta && !silent)
              c.tree.children.push(result.tree)
        }

        if (repeat) {
          while (true) {
            var curDepth = c.length == 0 ? depth+1 : 0
            var result   = parseSymbol(table, tokens, curSymbol, token+c.length, curDepth)

            c.error = Math.max(c.error, result.error)
            if (!result.length) break

            c.length += result.length
            if (meta && result.tree.children)
              _.each(result.tree.children, function (child) { c.tree.children.push(child) })
            if (!meta && !silent)
              c.tree.children.push(result.tree)

            if (onlyOnce) break
          }
        }
      }

      return c
    }


    var niceTree = function (input, tokens, tree) {
      var token = tokens[tree.token]
      return _.extend(tree, {
        text:     token ? input.substring(token.start, token.end) : undefined,
        token:    token,
        children: _.map(tree.children, function (child) {
          return niceTree(input, tokens, child)
        }),
      })
    }


    return parse
  }


  var bnfParser = Parser(32,
    {
      lsymbol:  "[a-zA-Z0-9]+\\*?",
      rsymbol:  "(@|\\$)?[a-zA-Z0-9]+(\\?|\\*|\\+|)",
      string:   '"([^\\\\"\n]|\\\\.)*"',
      eq:       "=",
      dollar:   "\\$",
      bang:     "!",
      pipe:     "\\|",
      op:       "\\(",
      cp:       "\\)",
      nl:       "\n",
      $space:   "[ \t]+",
      $comment: "#[^\n]*",
    },
    {
      INPUT:    "$nl* TOKENS SYMBOLS",
      TOKENS:   "TOKEN*",
      TOKEN:    "lsymbol $eq string $nl+ | dollar string $nl+ | bang string $nl+",
      SYMBOLS:  "SYMBOL*",
      SYMBOL:   "lsymbol $eq OPTIONS $nl+",
      OPTIONS:  "OPTION @OPTIONS2*",
      OPTIONS2: "$pipe OPTION",
      OPTION:   "@OPTION2*",
      OPTION2:  "lsymbol | rsymbol",
    }
  )


  var BNFParser = function (maxDepth, grammar) {

    var g = bnfParser(grammar)
    if (g.error) throw g.error

    var tokenCount = 0
    var tokenDefs = _.object(_.map(g.children[0].children, function (token) {
      var name    = token.children[0].text
      var pattern = token.children[1].text
      if (token.children[0].token.type == "dollar") name = "$" + tokenCount++
      if (token.children[0].token.type == "bang")   name = "!" + tokenCount++
      pattern = pattern.substring(1, pattern.length-1)
      try { RegExp(pattern) }
      catch (e) { throw {
        type:  "Grammatical",
        start: token.children[1].token.start,
        end:   token.children[1].token.end,
      }}
      return [name, pattern]
    }))

    var symbolDefs = _.object(_.map(g.children[1].children, function (expansion) {
      var name  = expansion.children[0].text
      var rules = _.reduce(
        _.map(expansion.children[1].children, function (rule) {
          return _.map(rule.children, function (symbol) {
            return symbol.text
          })
        }),
        function (memo, value) {
          var expansion = _.reduce(value, function (memo, value) {
            return (memo == "" ? "" : memo + " ") + value
          }, "")
          return (memo == "" ? "" : memo + " | ") + expansion
        },
        ""
      )
      return [name, rules]
    }))

    _.each(g.children[1].children, function (expansion) {
      _.each(expansion.children[1].children, function (rule) {
        _.each(rule.children, function (symbol) {
          var name = symbol.text.replace(/\$|@|\*|\+|\?/, "")
          if (tokenDefs[name] == undefined && symbolDefs[name] == undefined)
            throw {
              type: "Unkown Symbol",
              start: symbol.token.start,
              end:   symbol.token.end,
            }
        })
      })
    })

    return Parser(maxDepth, tokenDefs, symbolDefs)
  }


  var root = this
  if (typeof exports !== "undefined") root = exports
  root.Parser = Parser
  root.BNFParser = BNFParser


}).call(this)